import type { WorkspaceRole } from './workspace.js';
import { WORKSPACE_ROLES } from './workspace.js';
import type { ProjectRole } from './projectRoles.js';
import { PROJECT_ROLE_RANK } from './projectRoles.js';

export interface WorkspaceRolePolicy {
  /** Vai trò project ở MỌI project của workspace, không cần dòng thành viên. null: không có. */
  readonly implicitProjectRole: ProjectRole | null;
  /** Vai trò project cao nhất được gán. Vai trò được gán vượt trần bị cắt về trần. */
  readonly projectRoleCeiling: ProjectRole;
  /** Vai trò khi tự tham gia project công khai (giai đoạn Project, Q-R1). null: không được tự tham gia. */
  readonly selfJoinProjectRole: ProjectRole | null;
  /** true: đổi/xoá được vai trò project của mọi Member/Guest workspace, kể cả Project Admin ngang hàng (Q-R14). */
  readonly overridesProjectRank: boolean;
}

import type { WorkspacePermission } from './workspacePermissions.js';

export const WORKSPACE_ROLE_POLICY = {
  admin: {
    implicitProjectRole: 'admin',
    projectRoleCeiling: 'admin',
    selfJoinProjectRole: 'admin',
    overridesProjectRank: true,
  },
  member: {
    implicitProjectRole: null,
    projectRoleCeiling: 'admin',
    selfJoinProjectRole: 'contributor',
    overridesProjectRank: false,
  },
  guest: {
    implicitProjectRole: null,
    projectRoleCeiling: 'guest',
    selfJoinProjectRole: null,
    overridesProjectRank: false,
  },
} as const satisfies Record<WorkspaceRole, WorkspaceRolePolicy>;

/** Vai trò ghi cho người tạo project (Q-R11). */
export const PROJECT_CREATOR_ROLE = 'admin' as const satisfies ProjectRole;

export function higherProjectRole(
  a: ProjectRole | null,
  b: ProjectRole | null,
): ProjectRole | null {
  if (a === null) return b;
  if (b === null) return a;
  return PROJECT_ROLE_RANK[a] >= PROJECT_ROLE_RANK[b] ? a : b;
}

export function lowerProjectRole(a: ProjectRole, b: ProjectRole): ProjectRole {
  return PROJECT_ROLE_RANK[a] <= PROJECT_ROLE_RANK[b] ? a : b;
}

export function projectRoleCeilingOf(role: WorkspaceRole): ProjectRole {
  return WORKSPACE_ROLE_POLICY[role].projectRoleCeiling;
}

export function selfJoinProjectRoleOf(
  role: WorkspaceRole,
  permissions: readonly WorkspacePermission[],
): ProjectRole | null {
  const baseRole = WORKSPACE_ROLE_POLICY[role].selfJoinProjectRole;
  if (baseRole === null) return null;
  if (!permissions.includes('workspace.projects.browse')) return null;
  return baseRole;
}

/** Các workspace role có quyền ngầm ở mọi project. Dùng làm tham số truy vấn (B10.4), không viết cứng ['admin']. */
export function workspaceRolesWithImplicitProjectAccess(): readonly WorkspaceRole[] {
  return WORKSPACE_ROLES.filter(
    (role) => WORKSPACE_ROLE_POLICY[role].implicitProjectRole !== null,
  );
}
