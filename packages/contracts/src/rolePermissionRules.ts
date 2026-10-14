import type { MessageRef } from "./catalog/index.js";
import type { WorkspaceRole } from "./workspace.js";
import type { WorkspacePermission } from "./workspacePermissions.js";
import type { ProjectRole } from "./projectRoles.js";

export const ROLE_SCOPES = ["workspace", "project"] as const;
export type RoleScope = (typeof ROLE_SCOPES)[number];

export type RoleRef =
  | { scope: "workspace"; key: WorkspaceRole }
  | { scope: "project"; key: ProjectRole };

export const LOCKED_ROLES = [
  { scope: "workspace", key: "admin" },
  { scope: "project", key: "admin" },
] as const satisfies readonly RoleRef[];

export const ADMIN_ONLY_PERMISSIONS = [
  "workspace.delete",
  "workspace.members.add",
] as const satisfies readonly WorkspacePermission[];

export const VIEW_ONLY_ROLES = [
  { scope: "workspace", key: "guest" },
  { scope: "project", key: "viewer" },
] as const satisfies readonly RoleRef[];

export const PERMISSION_GRANT_PROBLEMS = [
  "UNKNOWN_PERMISSION",
  "SCOPE_MISMATCH",
  "ROLE_LOCKED",
  "ADMIN_ONLY",
  "GUEST_VIEW_ONLY",
] as const;
export type PermissionGrantProblem = (typeof PERMISSION_GRANT_PROBLEMS)[number];

export const PERMISSION_GRANT_PROBLEM_MESSAGES = {
  UNKNOWN_PERMISSION: "Unknown permission",
  SCOPE_MISMATCH: "Scope mismatch",
  ROLE_LOCKED:
    "This role always has its default permissions and can't be changed",
  ADMIN_ONLY: "Only Admins can have this permission",
  GUEST_VIEW_ONLY: "Guests and Viewers can only view",
} as const satisfies Record<PermissionGrantProblem, string>;

export const PERMISSION_GRANT_PROBLEM_REFS = {
  UNKNOWN_PERMISSION: { key: "admin:errors.unknownPermission" },
  SCOPE_MISMATCH: { key: "admin:errors.scopeMismatch" },
  ROLE_LOCKED: { key: "admin:errors.roleLocked" },
  ADMIN_ONLY: { key: "admin:errors.adminOnly" },
  GUEST_VIEW_ONLY: { key: "admin:errors.guestViewOnly" },
} as const satisfies Record<PermissionGrantProblem, MessageRef>;

export function isRoleLocked(role: RoleRef): boolean {
  return LOCKED_ROLES.some(
    (locked) => locked.scope === role.scope && locked.key === role.key,
  );
}

export function isViewOnlyRole(role: RoleRef): boolean {
  return VIEW_ONLY_ROLES.some(
    (r) => r.scope === role.scope && r.key === role.key,
  );
}

/**
 * True for the workspace's Admin role: the locked role that always keeps its
 * full default permissions. For displaying data (e.g. "No active Admin"), not
 * for permission decisions, which use enforced permissions.
 */
export function isWorkspaceAdminRole(role: WorkspaceRole): boolean {
  return isRoleLocked({ scope: "workspace", key: role });
}

/**
 * True for the project's Admin role: the locked role that always keeps its
 * full default permissions. For displaying data (e.g. "assigned Project Admin"),
 * not for permission decisions, which use enforced permissions.
 */
export function isProjectAdminRole(role: ProjectRole): boolean {
  return isRoleLocked({ scope: "project", key: role });
}

export function scopeOfPermission(permission: string): RoleScope | null {
  if (typeof permission !== "string" || !permission.includes(".")) {
    return null;
  }
  const prefix = permission.split(".")[0];
  if (prefix === "workspace" || prefix === "project") {
    return prefix;
  }
  return null;
}

export function permissionGrantProblem(
  role: RoleRef,
  permission: string,
): PermissionGrantProblem | null {
  const permScope = scopeOfPermission(permission);
  // G0: Tên quyền phải có trong danh mục code
  if (permScope === null) {
    return "UNKNOWN_PERMISSION";
  }
  // G1: Quyền chỉ gắn cho vai trò cùng scope
  if (permScope !== role.scope) {
    return "SCOPE_MISMATCH";
  }
  // G2: Admin (workspace) và Project Admin bị khoá
  if (isRoleLocked(role)) {
    return "ROLE_LOCKED";
  }
  // G3: workspace.delete, workspace.members.add chỉ Admin giữ
  if (
    (ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(permission) &&
    !LOCKED_ROLES.some((r) => r.scope === role.scope && r.key === role.key)
  ) {
    return "ADMIN_ONLY";
  }
  // G4: Guest (workspace) và Viewer (project) chỉ giữ quyền có tên kết thúc bằng .view
  if (isViewOnlyRole(role) && !permission.endsWith(".view")) {
    return "GUEST_VIEW_ONLY";
  }
  return null;
}

export function permissionRevokeProblem(role: RoleRef): "ROLE_LOCKED" | null {
  return isRoleLocked(role) ? "ROLE_LOCKED" : null;
}
