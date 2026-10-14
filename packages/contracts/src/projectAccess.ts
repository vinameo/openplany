import type { WorkspaceRole } from "./workspace.js";
import {
  type ProjectRole,
  PROJECT_ROLE_RANK,
  higherProjectRole,
  lowerProjectRole,
} from "./projectRoles.js";
import type {
  ProjectPermission,
  ProjectRolePermissions,
} from "./projectPermissions.js";
import type { ProjectAccessPolicies } from "./projectAccessPolicy.js";

export interface ProjectAccessInput {
  workspaceRole: WorkspaceRole | null;
  assignedRole: ProjectRole | null;
}

export function effectiveProjectRole(
  { workspaceRole, assignedRole }: ProjectAccessInput,
  policies: ProjectAccessPolicies,
): ProjectRole | null {
  if (workspaceRole === null) return null;
  const policy = policies[workspaceRole];
  const assigned =
    assignedRole === null
      ? null
      : lowerProjectRole(assignedRole, policy.highestAssignableRole);
  return higherProjectRole(policy.implicitProjectRole, assigned);
}

export function isProjectRoleOutOfRange(
  { workspaceRole, assignedRole }: ProjectAccessInput,
  policies: ProjectAccessPolicies,
): boolean {
  if (workspaceRole === null || assignedRole === null) return false;
  const policy = policies[workspaceRole];
  if (policy.implicitProjectRole !== null) {
    return true;
  }
  const rank = PROJECT_ROLE_RANK[assignedRole];
  return (
    rank < PROJECT_ROLE_RANK[policy.lowestAssignableRole] ||
    rank > PROJECT_ROLE_RANK[policy.highestAssignableRole]
  );
}

export function isProjectRoleLimited(
  { workspaceRole, assignedRole }: ProjectAccessInput,
  policies: ProjectAccessPolicies,
): boolean {
  if (workspaceRole === null || assignedRole === null) return false;
  const policy = policies[workspaceRole];
  return (
    PROJECT_ROLE_RANK[assignedRole] >
    PROJECT_ROLE_RANK[policy.highestAssignableRole]
  );
}

export interface ProjectAccess {
  role: ProjectRole;
  permissions: readonly ProjectPermission[];
}

export function resolveProjectAccess(
  input: ProjectAccessInput,
  policies: ProjectAccessPolicies,
  matrix: ProjectRolePermissions,
): ProjectAccess | null {
  const role = effectiveProjectRole(input, policies);
  return role === null ? null : { role, permissions: matrix[role] };
}
