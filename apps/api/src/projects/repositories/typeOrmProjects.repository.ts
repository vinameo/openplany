import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { PROJECT_CREATOR_ROLE } from '@repo/contracts';
import { DataSource, In } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import {
  isTransactionConflict,
  isUniqueViolation,
} from '../../common/databaseErrors.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
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
import { ACTIVE_PROJECT, ACTIVE_PROJECT_MEMBER } from '../projectFilters.js';
import {
  ProjectsRepository,
  type CreateProjectInput,
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
    opts: { includeEmail: boolean; limitPerProject: number },
  ): Promise<Map<string, ProjectMembersPreview>> {
    const result = new Map<string, ProjectMembersPreview>();
    if (projectIds.length === 0) return result;

    // Rank members inside each project and keep only the first N, so the
    // payload is bounded by projects × limit, not projects × members.
    const rows = await this.dataSource.manager
      .createQueryBuilder()
      .select('ranked.*')
      .from((sub) => {
        const members = sub
          .from(ProjectMember, 'pm')
          .innerJoin(
            WorkspaceMember,
            'wm',
            'wm.workspaceId = pm.workspaceId AND wm.memberId = pm.memberId',
          )
          .innerJoin(User, 'u', 'u.id = pm.memberId')
          .select('pm.projectId', 'projectId')
          .addSelect('pm.memberId', 'userId')
          .addSelect('pm.createdAt', 'addedAt')
          .addSelect('u.firstName', 'firstName')
          .addSelect('u.lastName', 'lastName')
          .addSelect('u.displayName', 'displayName')
          .addSelect('u.isActive', 'accountActive')
          .addSelect(
            'ROW_NUMBER() OVER (PARTITION BY pm.projectId ORDER BY pm.createdAt ASC, pm.memberId ASC)',
            'member_rank',
          )
          .addSelect(
            'COUNT(*) OVER (PARTITION BY pm.projectId)',
            'member_total',
          )
          .where({ projectId: In(projectIds), ...ACTIVE_PROJECT_MEMBER })
          .andWhere('wm.isActive = :wmActive', { wmActive: true });
        // Email is only selected when the viewer may see it (DB B5.2).
        return opts.includeEmail
          ? members.addSelect('u.email', 'email')
          : members;
      }, 'ranked')
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
        accountActive: row.accountActive,
      };
      if (opts.includeEmail && typeof row.email === 'string') {
        member.email = row.email;
      }
      preview.members.push(member);
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

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.dataSource.transaction(async (manager) => {
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

          // 2. insert ProjectMember (creator is Project Admin)
          await manager.insert(ProjectMember, {
            workspaceId,
            projectId,
            memberId: actorId,
            roleScope: 'project',
            role: PROJECT_CREATOR_ROLE,
            isActive: true,
            createdById: actorId,
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
            toRole: PROJECT_CREATOR_ROLE,
            changeType: 'project_created',
            actorId,
            requestId: requestId ?? null,
            createdAt: now,
          });
        });

        return { projectId };
      } catch (err: unknown) {
        if (isTransactionConflict(err) && attempt < 2) {
          this.logger.warn(
            `project.create.retry conflict attempt=${attempt} requestId=${requestId ?? ''}`,
          );
          continue;
        }
        if (isUniqueViolation(err, PROJECT_NAME_UNIQUE)) {
          throw new ProjectNameTakenError();
        }
        if (isUniqueViolation(err, PROJECT_IDENTIFIER_UNIQUE)) {
          throw new ProjectIdentifierTakenError();
        }
        throw err;
      }
    }

    throw new Error('Project creation failed after retries');
  }

  async update(input: UpdateProjectInput): Promise<ProjectRow | null> {
    const { projectId, workspaceId, actorId, now, changes } = input;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await this.dataSource.transaction(async (manager) => {
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
        });
      } catch (err: unknown) {
        if (isTransactionConflict(err) && attempt < 2) {
          this.logger.warn(
            `project.update.retry conflict attempt=${attempt} projectId=${projectId}`,
          );
          continue;
        }
        if (isUniqueViolation(err, PROJECT_NAME_UNIQUE)) {
          throw new ProjectNameTakenError();
        }
        throw err;
      }
    }

    throw new Error('Project update failed after retries');
  }
}
