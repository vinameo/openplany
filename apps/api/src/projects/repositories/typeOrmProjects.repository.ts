import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  PROJECT_CREATOR_ROLE,
  PROJECT_ROLES,
  resolveProjectAccess,
  workspaceRolesWithImplicitProjectAccess,
  type ProjectAccess,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';
import { DataSource, In } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import {
  isTransactionConflict,
  isUniqueViolation,
} from '../../common/databaseErrors.js';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
import type { ProjectMemberRow, ProjectRow } from '../dto/projectResponse.js';
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
    opts: { includeEmail: boolean },
  ): Promise<Map<string, ProjectMemberRow[]>> {
    const result = new Map<string, ProjectMemberRow[]>();
    if (projectIds.length === 0) return result;

    const qb = this.dataSource.manager
      .createQueryBuilder(ProjectMember, 'pm')
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
      .where({ projectId: In(projectIds), ...ACTIVE_PROJECT_MEMBER })
      .andWhere('wm.isActive = :wmActive', { wmActive: true })
      .orderBy('pm.projectId', 'ASC')
      .addOrderBy('pm.createdAt', 'ASC')
      .addOrderBy('pm.memberId', 'ASC');

    if (opts.includeEmail) {
      qb.addSelect('u.email', 'email');
    }

    const rows = await qb.getRawMany<{
      projectId: string;
      userId: string;
      addedAt: Date;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      email?: string | null;
      accountActive: boolean;
    }>();

    for (const row of rows) {
      let list = result.get(row.projectId);
      if (!list) {
        list = [];
        result.set(row.projectId, list);
      }
      const memberRow: ProjectMemberRow = {
        projectId: row.projectId,
        userId: row.userId,
        addedAt: row.addedAt,
        firstName: row.firstName ?? '',
        lastName: row.lastName ?? '',
        displayName: row.displayName ?? '',
        accountActive: row.accountActive,
      };
      if (opts.includeEmail && row.email !== undefined && row.email !== null) {
        memberRow.email = row.email;
      }
      list.push(memberRow);
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

  async findAccessible(input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
    projectId: string;
  }): Promise<{ project: ProjectRow; access: ProjectAccess } | null> {
    const { workspaceId, userId, workspaceRole, projectId } = input;
    const manager = this.dataSource.manager;

    const project = await manager.findOne(Project, {
      where: { ...ACTIVE_PROJECT, workspaceId, id: projectId },
    });
    if (!project) return null;

    const membership = await manager.findOne(ProjectMember, {
      select: { role: true },
      where: {
        ...ACTIVE_PROJECT_MEMBER,
        workspaceId,
        projectId,
        memberId: userId,
      },
    });

    const assignedRole = membership?.role ?? null;
    const hasImplicitAccess =
      workspaceRolesWithImplicitProjectAccess().includes(workspaceRole);

    if (!hasImplicitAccess && assignedRole === null) {
      return null;
    }

    const permMap = await loadRolePermissions(
      manager,
      PROJECT_ROLES.map((key) => ({ scope: 'project', key })),
    );

    const matrix = {} as Record<ProjectRole, readonly string[]>;
    for (const roleKey of PROJECT_ROLES) {
      matrix[roleKey] =
        permMap.get(rolePermissionsKey('project', roleKey)) ?? [];
    }

    const access = resolveProjectAccess(
      { workspaceRole, assignedRole },
      matrix,
    );
    if (!access) return null;

    return {
      project: {
        id: project.id,
        name: project.name,
        identifier: project.identifier,
        description: project.description,
        iconName: project.iconName,
        iconColor: project.iconColor,
        coverKey: project.coverKey,
        createdAt: project.createdAt,
      },
      access,
    };
  }
}
