import type { WorkspaceRole } from "./workspace.js";
import { WORKSPACE_ROLES, WORKSPACE_ROLE_RANK } from "./workspace.js";
import type { WorkspacePermission } from "./workspacePermissions.js";
import type { ProjectRole } from "./projectRoles.js";
import { PROJECT_ROLES, PROJECT_ROLE_RANK } from "./projectRoles.js";
import type { ProjectPermission } from "./projectPermissions.js";
import type { ProjectAccessPolicies } from "./projectAccessPolicy.js";
import { effectiveProjectRole } from "./projectAccess.js";

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
  if (!actor.permissions.includes("workspace.members.role.update")) return [];
  if (WORKSPACE_ROLE_RANK[actor.role] < WORKSPACE_ROLE_RANK[target.role])
    return [];
  return WORKSPACE_ROLES.filter(
    (r) => WORKSPACE_ROLE_RANK[r] <= WORKSPACE_ROLE_RANK[actor.role],
  );
}

/** Vai trò actor được gán khi THÊM người mới. Thứ bậc ≤ actor (RP-RQ B8.1). */
export function addableWorkspaceRoles(actor: WorkspaceActor): WorkspaceRole[] {
  if (!actor.permissions.includes("workspace.members.add")) return [];
  return WORKSPACE_ROLES.filter(
    (r) => WORKSPACE_ROLE_RANK[r] <= WORKSPACE_ROLE_RANK[actor.role],
  );
}

export const DEFAULT_ADDED_WORKSPACE_ROLE =
  "member" as const satisfies WorkspaceRole;

export function canRemoveWorkspaceMember(
  actor: WorkspaceActor,
  target: { userId: string; role: WorkspaceRole },
): boolean {
  if (actor.userId === target.userId) return false;
  if (!actor.permissions.includes("workspace.members.remove")) return false;
  if (WORKSPACE_ROLE_RANK[actor.role] < WORKSPACE_ROLE_RANK[target.role])
    return false;
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
  policies: ProjectAccessPolicies,
): ProjectRole[] {
  if (actor.userId === target.userId) return [];
  if (
    actor.effectiveRole === null ||
    !actor.permissions.includes("project.members.manage")
  ) {
    return [];
  }
  const targetPolicy = policies[target.workspaceRole];
  if (targetPolicy.implicitProjectRole !== null) {
    return [];
  }
  const targetEffectiveRole = effectiveProjectRole(
    {
      workspaceRole: target.workspaceRole,
      assignedRole: target.assignedRole,
    },
    policies,
  );
  const actorPolicy = policies[actor.workspaceRole];
  if (
    !actorPolicy.overridesProjectRank &&
    targetEffectiveRole !== null &&
    PROJECT_ROLE_RANK[targetEffectiveRole] >=
      PROJECT_ROLE_RANK[actor.effectiveRole]
  ) {
    return [];
  }
  const maxRank = Math.min(
    PROJECT_ROLE_RANK[targetPolicy.highestAssignableRole],
    PROJECT_ROLE_RANK[actor.effectiveRole],
  );
  const minRank = PROJECT_ROLE_RANK[targetPolicy.lowestAssignableRole];
  if (maxRank < minRank) {
    return [];
  }
  return PROJECT_ROLES.filter((r) => {
    const rank = PROJECT_ROLE_RANK[r];
    return rank >= minRank && rank <= maxRank;
  });
}

/** Vai trò actor gán được khi THÊM target (chưa có vai trò project). */
export function addableProjectRoles(
  actor: ProjectActor,
  target: { userId: string; workspaceRole: WorkspaceRole },
  policies: ProjectAccessPolicies,
): ProjectRole[] {
  return assignableProjectRoles(
    actor,
    { ...target, assignedRole: null },
    policies,
  );
}

/** Mọi vai trò actor có thể gán cho ai đó (dùng cho dropdown trước khi chọn người và cho nút Add member). */
export function addableProjectRoleRange(
  actor: ProjectActor,
  policies: ProjectAccessPolicies,
): ProjectRole[] {
  if (
    actor.effectiveRole === null ||
    !actor.permissions.includes("project.members.manage")
  ) {
    return [];
  }
  const actorMaxRank = PROJECT_ROLE_RANK[actor.effectiveRole];
  const allowed = new Set<ProjectRole>();
  for (const wsRole of WORKSPACE_ROLES) {
    const policy = policies[wsRole];
    if (policy.implicitProjectRole !== null) continue;
    const minRank = PROJECT_ROLE_RANK[policy.lowestAssignableRole];
    const maxRank = Math.min(
      PROJECT_ROLE_RANK[policy.highestAssignableRole],
      actorMaxRank,
    );
    if (maxRank < minRank) continue;
    for (const role of PROJECT_ROLES) {
      const rank = PROJECT_ROLE_RANK[role];
      if (rank >= minRank && rank <= maxRank) {
        allowed.add(role);
      }
    }
  }
  return PROJECT_ROLES.filter((r) => allowed.has(r));
}

export const DEFAULT_ADDED_PROJECT_ROLE =
  "contributor" as const satisfies ProjectRole;

export function canRemoveProjectMember(
  actor: ProjectActor,
  target: ProjectTarget,
  policies: ProjectAccessPolicies,
): boolean {
  if (target.assignedRole === null) return false;
  if (actor.userId === target.userId) return false;
  if (
    actor.effectiveRole === null ||
    !actor.permissions.includes("project.members.manage")
  ) {
    return false;
  }
  if (policies[target.workspaceRole].implicitProjectRole !== null) {
    return false;
  }
  const targetEffectiveRole = effectiveProjectRole(
    {
      workspaceRole: target.workspaceRole,
      assignedRole: target.assignedRole,
    },
    policies,
  );
  if (
    !policies[actor.workspaceRole].overridesProjectRank &&
    targetEffectiveRole !== null &&
    PROJECT_ROLE_RANK[targetEffectiveRole] >=
      PROJECT_ROLE_RANK[actor.effectiveRole]
  ) {
    return false;
  }
  return true;
}

export function projectRolesAboveCeiling(
  newRole: WorkspaceRole,
  policies: ProjectAccessPolicies,
): ProjectRole[] {
  const ceiling = policies[newRole].highestAssignableRole;
  return PROJECT_ROLES.filter(
    (role) => PROJECT_ROLE_RANK[role] > PROJECT_ROLE_RANK[ceiling],
  );
}
