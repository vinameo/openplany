import type { WorkspaceRole } from "./workspace.js";
import { WORKSPACE_ROLES } from "./workspace.js";
import type { ProjectRole } from "./projectRoles.js";
import {
  PROJECT_ROLES,
  PROJECT_ROLE_RANK,
  PROJECT_CREATOR_ROLE,
} from "./projectRoles.js";

export interface ProjectAccessPolicy {
  readonly workspaceRole: WorkspaceRole;
  /** Vai trò ở MỌI project, không cần dòng thành viên. null: không có. */
  readonly implicitProjectRole: ProjectRole | null;
  /** Khoảng được gán khi thêm vào project (theo rank, gồm hai đầu). */
  readonly lowestAssignableRole: ProjectRole;
  readonly highestAssignableRole: ProjectRole;
  /** true: đổi/gỡ được cả Project Admin ngang hàng (RP-RQ Q-R14). */
  readonly overridesProjectRank: boolean;
}

export type ProjectAccessPolicies = Readonly<
  Record<WorkspaceRole, ProjectAccessPolicy>
>;

/** [] khi implicitProjectRole ≠ null; ngược lại PROJECT_ROLES trong khoảng, rank giảm dần */
export function assignableRangeOf(policy: ProjectAccessPolicy): ProjectRole[] {
  if (policy.implicitProjectRole !== null) {
    return [];
  }
  const minRank = PROJECT_ROLE_RANK[policy.lowestAssignableRole];
  const maxRank = PROJECT_ROLE_RANK[policy.highestAssignableRole];
  return PROJECT_ROLES.filter((role) => {
    const r = PROJECT_ROLE_RANK[role];
    return r >= minRank && r <= maxRank;
  });
}

export function hasImplicitProjectAccess(policy: ProjectAccessPolicy): boolean {
  return policy.implicitProjectRole !== null;
}

export function workspaceRolesWithImplicitProjectAccess(
  policies: ProjectAccessPolicies,
): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter(
    (role) => policies[role].implicitProjectRole !== null,
  );
}

/**
 * Người tạo project được ghi là thành viên với vai trò này; null khi họ có vai trò ngầm định (D5).
 * null khi có ngầm định; PROJECT_CREATOR_ROLE (='admin') nếu ∈ khoảng, ngược lại highestAssignableRole.
 */
export function projectCreatorMembershipRole(
  policy: ProjectAccessPolicy,
): ProjectRole | null {
  if (policy.implicitProjectRole !== null) {
    return null;
  }
  const creatorRank = PROJECT_ROLE_RANK[PROJECT_CREATOR_ROLE];
  const minRank = PROJECT_ROLE_RANK[policy.lowestAssignableRole];
  const maxRank = PROJECT_ROLE_RANK[policy.highestAssignableRole];
  if (creatorRank >= minRank && creatorRank <= maxRank) {
    return PROJECT_CREATOR_ROLE;
  }
  return policy.highestAssignableRole;
}

function isProjectRole(val: unknown): val is ProjectRole {
  return (
    typeof val === "string" &&
    (PROJECT_ROLES as readonly string[]).includes(val)
  );
}

function isWorkspaceRole(val: unknown): val is WorkspaceRole {
  return (
    typeof val === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(val)
  );
}

/**
 * Lỗi đầu tiên tìm thấy, null khi hợp lệ (INV-03).
 */
export function validateProjectAccessPolicies(
  rows: readonly ProjectAccessPolicy[],
): string | null {
  if (!Array.isArray(rows)) {
    return "Expected an array of project access policies";
  }

  const seenRoles = new Set<WorkspaceRole>();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      return "Policy row must be an object";
    }

    const {
      workspaceRole,
      implicitProjectRole,
      lowestAssignableRole,
      highestAssignableRole,
    } = row;

    if (!isWorkspaceRole(workspaceRole)) {
      return `Unknown workspace role: ${String(workspaceRole)}`;
    }

    if (seenRoles.has(workspaceRole)) {
      return `Duplicate policy for workspace role: ${workspaceRole}`;
    }
    seenRoles.add(workspaceRole);

    if (implicitProjectRole !== null && !isProjectRole(implicitProjectRole)) {
      return `Unknown implicit project role: ${String(implicitProjectRole)}`;
    }

    if (!isProjectRole(lowestAssignableRole)) {
      return `Unknown lowest assignable role: ${String(lowestAssignableRole)}`;
    }

    if (!isProjectRole(highestAssignableRole)) {
      return `Unknown highest assignable role: ${String(highestAssignableRole)}`;
    }

    const lowestRank = PROJECT_ROLE_RANK[lowestAssignableRole];
    const highestRank = PROJECT_ROLE_RANK[highestAssignableRole];
    if (lowestRank > highestRank) {
      return `Lowest assignable role (${lowestAssignableRole}) cannot have higher rank than highest (${highestAssignableRole}) for ${workspaceRole}`;
    }

    if (implicitProjectRole !== null) {
      if (
        lowestAssignableRole !== implicitProjectRole ||
        highestAssignableRole !== implicitProjectRole
      ) {
        return `Workspace role with implicit role (${implicitProjectRole}) must have lowest and highest role equal to implicit role`;
      }
    }
  }

  for (const role of WORKSPACE_ROLES) {
    if (!seenRoles.has(role)) {
      return `Missing policy for workspace role: ${role}`;
    }
  }

  return null;
}
