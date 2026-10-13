import {
  type EntityManager,
  type FindOptionsWhere,
  IsNull,
  type SelectQueryBuilder,
} from 'typeorm';
import { User } from '../auth/entities/user.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspaceMember.entity.js';
import type { Project } from './entities/project.entity.js';
import { ProjectMember } from './entities/projectMember.entity.js';

export const ACTIVE_PROJECT: FindOptionsWhere<Project> = {
  deletedAt: IsNull(),
};

export const ACTIVE_PROJECT_MEMBER: FindOptionsWhere<ProjectMember> = {
  isActive: true,
};

/**
 * Project members of the given projects: active project row AND active
 * workspace membership. Joined to the user. Callers add select/order.
 * Optionally excludes workspace roles with implicit project access (DB B5.2).
 */
export function projectMembersQuery(
  manager: EntityManager,
  where: FindOptionsWhere<ProjectMember>,
  implicitRoles: readonly string[] = [],
): SelectQueryBuilder<ProjectMember> {
  const qb = manager
    .createQueryBuilder(ProjectMember, 'pm')
    .innerJoin(
      WorkspaceMember,
      'wm',
      'wm.workspaceId = pm.workspaceId AND wm.memberId = pm.memberId',
    )
    .innerJoin(User, 'u', 'u.id = pm.memberId')
    .where(where)
    .andWhere('pm.isActive = true')
    .andWhere('wm.isActive = true');

  if (implicitRoles.length > 0) {
    qb.andWhere('wm.role NOT IN (:...implicitRoles)', { implicitRoles });
  }

  return qb;
}

/**
 * Workspace members with implicit project access (DB B5.2).
 * Active workspace membership with role in implicitRoles. Joined to User.
 */
export function inheritedProjectMembersQuery(
  manager: EntityManager,
  workspaceId: string,
  implicitRoles: readonly string[],
): SelectQueryBuilder<WorkspaceMember> {
  return manager
    .createQueryBuilder(WorkspaceMember, 'wm')
    .innerJoin(User, 'u', 'u.id = wm.memberId')
    .where('wm.workspaceId = :workspaceId', { workspaceId })
    .andWhere('wm.isActive = true')
    .andWhere('wm.role IN (:...implicitRoles)', { implicitRoles });
}

