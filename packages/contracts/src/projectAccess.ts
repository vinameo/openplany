import type { WorkspaceRole } from './workspace.js';
import type { ProjectRole } from './projectRoles.js';
import { PROJECT_ROLE_RANK } from './projectRoles.js';
import type { ProjectPermission } from './projectPermissions.js';
import { projectPermissionsOf } from './projectPermissions.js';
import {
  WORKSPACE_ROLE_POLICY,
  higherProjectRole,
  lowerProjectRole,
} from './rolePolicy.js';

export interface ProjectAccessInput {
  workspaceRole: WorkspaceRole | null;
  assignedRole: ProjectRole | null;
}

export function effectiveProjectRole({
  workspaceRole,
  assignedRole,
}: ProjectAccessInput): ProjectRole | null {
  if (workspaceRole === null) return null;
  const policy = WORKSPACE_ROLE_POLICY[workspaceRole];
  const assigned =
    assignedRole === null
      ? null
      : lowerProjectRole(assignedRole, policy.projectRoleCeiling);
  return higherProjectRole(policy.implicitProjectRole, assigned);
}

export function isProjectRoleClamped({
  workspaceRole,
  assignedRole,
}: ProjectAccessInput): boolean {
  if (workspaceRole === null || assignedRole === null) return false;
  const policy = WORKSPACE_ROLE_POLICY[workspaceRole];
  return (
    PROJECT_ROLE_RANK[assignedRole] >
    PROJECT_ROLE_RANK[policy.projectRoleCeiling]
  );
}

export interface ProjectAccess {
  role: ProjectRole;
  permissions: readonly ProjectPermission[];
}

export function resolveProjectAccess(
  input: ProjectAccessInput,
): ProjectAccess | null {
  const role = effectiveProjectRole(input);
  return role === null
    ? null
    : { role, permissions: projectPermissionsOf(role) };
}
