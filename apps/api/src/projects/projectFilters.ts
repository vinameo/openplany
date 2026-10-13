import {
  In,
  type EntityManager,
  type FindOptionsWhere,
  IsNull,
  type SelectQueryBuilder,
} from 'typeorm';
import { PROJECT_ROLES, isProjectAdminRole } from '@repo/contracts';
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

function isQueryBuilder(
  target: EntityManager | SelectQueryBuilder<ProjectMember>,
): target is SelectQueryBuilder<ProjectMember> {
  return 'connection' in target && 'expressionMap' in target;
}

/**
 * Counts assigned Project Admins grouped by project for a set of projectIds (DB B3.2, DB-04).
 * Uses the project member filter (active membership, active user, non-implicit workspace role)
 * and groups by pm.projectId in a single query.
 */
export async function assignedProjectAdmins(
  managerOrQb: EntityManager | SelectQueryBuilder<ProjectMember>,
  projectIds: readonly string[],
  implicitRoles: readonly string[] = ['admin'],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const projectAdminRoles = PROJECT_ROLES.filter(isProjectAdminRole);
  const qb = isQueryBuilder(managerOrQb)
    ? managerOrQb
    : projectMembersQuery(
        managerOrQb,
        { projectId: In(projectIds) },
        implicitRoles,
      );

  const rows = await qb
    .select('pm.projectId', 'projectId')
    .addSelect('count(*)', 'count')
    .andWhere('u.isActive = :userActive', { userActive: true })
    .andWhere('pm.role IN (:...projectAdminRoles)', { projectAdminRoles })
    .groupBy('pm.projectId')
    .getRawMany<{ projectId: string; count: string | number }>();

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.projectId, Number(row.count));
  }
  return map;
}
