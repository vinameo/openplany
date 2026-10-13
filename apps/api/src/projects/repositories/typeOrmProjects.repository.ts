import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PROJECT_CREATOR_ROLE } from '@repo/contracts';
import { DataSource, In } from 'typeorm';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import {
  toProjectRow,
  type ProjectMemberRow,
  type ProjectMembersPreview,
  type ProjectRow,
} from '../dto/projectResponse.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { ProjectMemberRoleHistory } from '../entities/projectMemberRoleHistory.entity.js';
import {
  ProjectIdentifierTakenError,
  ProjectNameTakenError,
} from '../projectErrors.js';
import {
  ACTIVE_PROJECT,
  inheritedProjectMembersQuery,
  projectMembersQuery,
} from '../projectFilters.js';
import {
  ProjectsRepository,
  type CreateProjectInput,
  type MembersOfOpts,
  type SoftDeleteProjectInput,
  type UpdateProjectInput,
} from './projects.repository.js';

export const PROJECT_NAME_UNIQUE = 'projects_workspace_name_lower_key';
export const PROJECT_IDENTIFIER_UNIQUE = 'projects_workspace_identifier_key';

@Injectable()
export class TypeOrmProjectsRepository extends ProjectsRepository {
  private readonly logger = new Logger(TypeOrmProjectsRepository.name);

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async membersOf(
    projectIds: readonly string[],
    opts: MembersOfOpts,
  ): Promise<Map<string, ProjectMembersPreview>> {
    const result = new Map<string, ProjectMembersPreview>();
    if (projectIds.length === 0) return result;

    // Rank members inside each project and keep only the first N, so the
    // payload is bounded by projects × limit, not projects × members.
    const subQuery = projectMembersQuery(
      this.dataSource.manager,
      {
        projectId: In(projectIds),
      },
      opts.implicitRoles,
    )
      .select('pm.projectId', 'projectId')
      .addSelect('pm.memberId', 'userId')
      .addSelect('pm.joinedAt', 'addedAt')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.isActive', 'accountActive')
      .addSelect(
        'ROW_NUMBER() OVER (PARTITION BY pm.projectId ORDER BY pm.joinedAt ASC, pm.memberId ASC)',
        'member_rank',
      )
      .addSelect('COUNT(*) OVER (PARTITION BY pm.projectId)', 'member_total');

    if (opts.includeEmail) {
      subQuery.addSelect('u.email', 'email');
    }

    const rows = await this.dataSource.manager
      .createQueryBuilder()
      .select('ranked.*')
      .from(`(${subQuery.getQuery()})`, 'ranked')
      .setParameters(subQuery.getParameters())
      .where('ranked.member_rank <= :limit', { limit: opts.limitPerProject })
      .orderBy('ranked.member_rank', 'ASC')
      .getRawMany<{
        projectId: string;
        userId: string;
        addedAt: Date;
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        email?: string | null;
        accountActive: boolean;
        member_total: string | number;
      }>();

    for (const row of rows) {
      let preview = result.get(row.projectId);
      if (preview === undefined) {
        preview = { members: [], total: Number(row.member_total) };
        result.set(row.projectId, preview);
      }
      const member: ProjectMemberRow = {
        projectId: row.projectId,
        userId: row.userId,
        addedAt: row.addedAt,
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        displayName: row.displayName ?? '',
        accountActive: Boolean(row.accountActive),
      };
      if (opts.includeEmail && typeof row.email === 'string') {
        member.email = row.email;
      }
      preview.members.push(member);
    }

    // Inherited members (Workspace Admins): query once for workspace if showInherited is true
    if (
      opts.showInherited &&
      opts.workspaceId &&
      opts.implicitRoles &&
      opts.implicitRoles.length > 0
    ) {
      const inheritedQb = inheritedProjectMembersQuery(
        this.dataSource.manager,
        opts.workspaceId,
        opts.implicitRoles,
      );

      const inheritedTotal = await inheritedQb.clone().getCount();

      const inheritedSubQuery = inheritedQb
        .select('wm.memberId', 'userId')
        .addSelect('wm.joinedAt', 'addedAt')
        .addSelect('u.firstName', 'firstName')
        .addSelect('u.lastName', 'lastName')
        .addSelect('u.displayName', 'displayName')
        .addSelect('u.isActive', 'accountActive')
        .orderBy('wm.joinedAt', 'ASC')
        .addOrderBy('wm.memberId', 'ASC')
        .limit(opts.limitPerProject);

      if (opts.includeEmail) {
        inheritedSubQuery.addSelect('u.email', 'email');
      }

      const inheritedRawRows = await inheritedSubQuery.getRawMany<{
        userId: string;
        addedAt: Date;
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        email?: string | null;
        accountActive: boolean;
      }>();

      const inheritedMembers: ProjectMemberRow[] = inheritedRawRows.map((r) => {
        const m: ProjectMemberRow = {
          projectId: '',
          userId: r.userId,
          addedAt: r.addedAt,
          firstName: r.firstName ?? '',
          lastName: r.lastName ?? '',
          displayName: r.displayName ?? '',
          accountActive: Boolean(r.accountActive),
        };
        if (opts.includeEmail && typeof r.email === 'string') {
          m.email = r.email;
        }
        return m;
      });

      // Merge into every project preview (Ticket 06: giữ dòng kế thừa trước)
      for (const projectId of projectIds) {
        let preview = result.get(projectId);
        if (preview === undefined) {
          preview = { members: [], total: 0 };
          result.set(projectId, preview);
        }
        if (inheritedTotal > 0) {
          preview.total += inheritedTotal;
          const assignedMembers = preview.members;
          preview.members = [
            ...inheritedMembers,
            ...assignedMembers,
          ].slice(0, opts.limitPerProject);
        }
      }
    }

    return result;
  }

  async create(input: CreateProjectInput): Promise<{ projectId: string }> {
    const {
      workspaceId,
      actorId,
      requestId,
      now,
      name,
      identifier,
      description,
      iconName,
      iconColor,
      coverKey,
    } = input;

    const projectId = randomUUID();

    try {
      return await runTransactionWithRetry(
        this.dataSource,
        async (manager) => {
          // 1. insert Project
          await manager.insert(Project, {
            id: projectId,
            workspaceId,
            name,
            identifier,
            description,
            iconName,
            iconColor,
            coverKey,
            createdById: actorId,
            updatedById: actorId,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
          });

          // 2. insert ProjectMember (only if creatorRole is not null; Workspace Admins have implicit access and no project_members row)
          const creatorRole =
            input.creatorRole !== undefined
              ? input.creatorRole
              : PROJECT_CREATOR_ROLE;
          if (creatorRole !== null) {
            await manager.insert(ProjectMember, {
              workspaceId,
              projectId,
              memberId: actorId,
              roleScope: 'project',
              role: creatorRole,
              isActive: true,
              createdById: actorId,
              joinedAt: now,
              createdAt: now,
              updatedAt: now,
            });

            // 3. insert ProjectMemberRoleHistory
            await manager.insert(ProjectMemberRoleHistory, {
              workspaceId,
              projectId,
              memberId: actorId,
              roleScope: 'project',
              fromRole: null,
              toRole: creatorRole,
              changeType: 'project_created',
              actorId,
              requestId: requestId ?? null,
              createdAt: now,
            });
          }

          return { projectId };
        },
        {
          maxAttempts: 2,
          onRetry: (attempt) => {
            this.logger.warn(
              `project.create.retry conflict attempt=${attempt} requestId=${requestId ?? ''}`,
            );
          },
        },
      );
    } catch (err: unknown) {
      if (isUniqueViolation(err, PROJECT_NAME_UNIQUE)) {
        throw new ProjectNameTakenError();
      }
      if (isUniqueViolation(err, PROJECT_IDENTIFIER_UNIQUE)) {
        throw new ProjectIdentifierTakenError();
      }
      throw err;
    }
  }

  async update(input: UpdateProjectInput): Promise<ProjectRow | null> {
    const { projectId, workspaceId, actorId, now, changes } = input;

    try {
      return await runTransactionWithRetry(
        this.dataSource,
        async (manager) => {
          const updateResult = await manager.update(
            Project,
            { id: projectId, workspaceId, ...ACTIVE_PROJECT },
            { ...changes, updatedAt: now, updatedById: actorId },
          );

          if (!updateResult.affected || updateResult.affected === 0) {
            return null;
          }

          const updatedProject = await manager.findOne(Project, {
            where: { id: projectId, workspaceId, ...ACTIVE_PROJECT },
          });

          return updatedProject ? toProjectRow(updatedProject) : null;
        },
        {
          maxAttempts: 2,
          onRetry: (attempt) => {
            this.logger.warn(
              `project.update.retry conflict attempt=${attempt} projectId=${projectId}`,
            );
          },
        },
      );
    } catch (err: unknown) {
      if (isUniqueViolation(err, PROJECT_NAME_UNIQUE)) {
        throw new ProjectNameTakenError();
      }
      throw err;
    }
  }

  async softDelete(input: SoftDeleteProjectInput): Promise<boolean> {
    const { projectId, workspaceId, actorId, now } = input;
    const updateResult = await this.dataSource.manager.update(
      Project,
      { id: projectId, workspaceId, ...ACTIVE_PROJECT },
      { deletedAt: now, updatedAt: now, updatedById: actorId },
    );
    return Boolean(updateResult.affected && updateResult.affected > 0);
  }
}
