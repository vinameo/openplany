import type { WorkspaceRole } from './workspace.js';
import { WORKSPACE_ROLES, WORKSPACE_ROLE_RANK } from './workspace.js';
import type { WorkspacePermission } from './workspacePermissions.js';
import type { ProjectRole } from './projectRoles.js';
import { PROJECT_ROLES, PROJECT_ROLE_RANK } from './projectRoles.js';
import type { ProjectPermission } from './projectPermissions.js';
import {
  WORKSPACE_ROLE_POLICY,
  projectRoleCeilingOf,
} from './rolePolicy.js';
import { effectiveProjectRole } from './projectAccess.js';

export interface WorkspaceActor {
  userId: string;
  role: WorkspaceRole;
  permissions: readonly WorkspacePermission[];
}

export function assignableWorkspaceRoles(
  actor: WorkspaceActor,
  target: { userId: string; role: WorkspaceRole },
): WorkspaceRole[] {
  if (actor.userId === target.userId) return [];
  if (!actor.permissions.includes('workspace.members.role.update')) return [];
  if (WORKSPACE_ROLE_RANK[actor.role] < WORKSPACE_ROLE_RANK[target.role]) return [];
  return WORKSPACE_ROLES.filter((r) => WORKSPACE_ROLE_RANK[r] <= WORKSPACE_ROLE_RANK[actor.role]);
}

/** Vai trò actor được gán khi THÊM người mới. Thứ bậc ≤ actor (RP-RQ B8.1). */
export function addableWorkspaceRoles(actor: WorkspaceActor): WorkspaceRole[] {
  if (!actor.permissions.includes('workspace.members.add')) return [];
  return WORKSPACE_ROLES.filter((r) => WORKSPACE_ROLE_RANK[r] <= WORKSPACE_ROLE_RANK[actor.role]);
}

export const DEFAULT_ADDED_WORKSPACE_ROLE = 'member' as const satisfies WorkspaceRole;

export function canRemoveWorkspaceMember(
  actor: WorkspaceActor,
  target: { userId: string; role: WorkspaceRole },
): boolean {
  if (actor.userId === target.userId) return false;
  if (!actor.permissions.includes('workspace.members.remove')) return false;
  if (WORKSPACE_ROLE_RANK[actor.role] < WORKSPACE_ROLE_RANK[target.role]) return false;
  return true;
}

export interface ProjectActor {
  userId: string;
  workspaceRole: WorkspaceRole;
  effectiveRole: ProjectRole | null;
  permissions: readonly ProjectPermission[];
}

export interface ProjectTarget {
  userId: string;
  workspaceRole: WorkspaceRole;
  assignedRole: ProjectRole | null;
}

export function assignableProjectRoles(
  actor: ProjectActor,
  target: ProjectTarget,
): ProjectRole[] {
  if (actor.userId === target.userId) return [];
  if (
    actor.effectiveRole === null ||
    !actor.permissions.includes('project.members.manage')
  ) {
    return [];
  }
  if (WORKSPACE_ROLE_POLICY[target.workspaceRole].implicitProjectRole !== null) {
    return [];
  }
  const targetEffectiveRole = effectiveProjectRole({
    workspaceRole: target.workspaceRole,
    assignedRole: target.assignedRole,
  });
  if (
    !WORKSPACE_ROLE_POLICY[actor.workspaceRole].overridesProjectRank &&
    targetEffectiveRole !== null &&
    PROJECT_ROLE_RANK[targetEffectiveRole] >= PROJECT_ROLE_RANK[actor.effectiveRole]
  ) {
    return [];
  }
  const ceiling = projectRoleCeilingOf(target.workspaceRole);
  const maxRank = Math.min(
    PROJECT_ROLE_RANK[ceiling],
    PROJECT_ROLE_RANK[actor.effectiveRole],
  );
  return PROJECT_ROLES.filter((r) => PROJECT_ROLE_RANK[r] <= maxRank);
}

export function canRemoveProjectMember(
  actor: ProjectActor,
  target: ProjectTarget,
): boolean {
  if (target.assignedRole === null) return false;
  if (actor.userId === target.userId) return false;
  if (
    actor.effectiveRole === null ||
    !actor.permissions.includes('project.members.manage')
  ) {
    return false;
  }
  if (WORKSPACE_ROLE_POLICY[target.workspaceRole].implicitProjectRole !== null) {
    return false;
  }
  const targetEffectiveRole = effectiveProjectRole({
    workspaceRole: target.workspaceRole,
    assignedRole: target.assignedRole,
  });
  if (
    !WORKSPACE_ROLE_POLICY[actor.workspaceRole].overridesProjectRank &&
    targetEffectiveRole !== null &&
    PROJECT_ROLE_RANK[targetEffectiveRole] >= PROJECT_ROLE_RANK[actor.effectiveRole]
  ) {
    return false;
  }
  return true;
}

export function projectRolesAboveCeiling(newRole: WorkspaceRole): ProjectRole[] {
  const ceiling = projectRoleCeilingOf(newRole);
  return PROJECT_ROLES.filter(
    (role) => PROJECT_ROLE_RANK[role] > PROJECT_ROLE_RANK[ceiling],
  );
}
