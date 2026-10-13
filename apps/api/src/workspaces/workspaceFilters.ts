import { In, type EntityManager } from 'typeorm';
import { WORKSPACE_ROLES, isWorkspaceAdminRole } from '@repo/contracts';
import { User } from '../auth/entities/user.entity.js';
import { WorkspaceMember } from './entities/workspaceMember.entity.js';

export interface CountActiveWorkspaceAdminsOpts {
  excludeMemberId?: string;
}

/**
 * Counts active Workspace Admins whose workspace membership AND user account
 * are currently active (DB B3.1, DB-03).
 */
export async function countActiveWorkspaceAdmins(
  manager: EntityManager,
  workspaceId: string,
  opts: CountActiveWorkspaceAdminsOpts = {},
): Promise<number> {
  const adminRoles = WORKSPACE_ROLES.filter(isWorkspaceAdminRole);
  const qb = manager
    .createQueryBuilder(WorkspaceMember, 'wm')
    .innerJoin(User, 'u', 'u.id = wm.memberId')
    .where({ workspaceId, isActive: true, role: In(adminRoles) })
    .andWhere('u.isActive = :active', { active: true });

  if (opts.excludeMemberId) {
    qb.andWhere('wm.memberId <> :exclude', { exclude: opts.excludeMemberId });
  }

  return qb.getCount();
}
