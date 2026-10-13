import type { WorkspaceRole } from "./workspace.js";
import { WORKSPACE_ROLES } from "./workspace.js";
import type { ProjectRole } from "./projectRoles.js";
import { PROJECT_ROLES, PROJECT_ROLE_RANK } from "./projectRoles.js";
import { PROJECT_CREATOR_ROLE } from "./rolePolicy.js";

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

/**
 * TEMP until CreateProjectAccessPolicies (ticket 03).
 * Dựng từ WORKSPACE_ROLE_POLICY hiện có, chưa có sàn (lowest = vai trò thấp nhất hiện tại).
 * Không export từ index.ts; chỉ store tạm và test dùng.
 */
export const LEGACY_PROJECT_ACCESS_POLICIES: ProjectAccessPolicies = {
  admin: {
    workspaceRole: "admin",
    implicitProjectRole: "admin",
    lowestAssignableRole: "admin",
    highestAssignableRole: "admin",
    overridesProjectRank: true,
  },
  member: {
    workspaceRole: "member",
    implicitProjectRole: null,
    lowestAssignableRole: "viewer",
    highestAssignableRole: "admin",
    overridesProjectRank: false,
  },
  guest: {
    workspaceRole: "guest",
    implicitProjectRole: null,
    lowestAssignableRole: "viewer",
    highestAssignableRole: "viewer",
    overridesProjectRank: false,
  },
};

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
