import {
  type EnforcedWorkspacePermission,
  ENFORCED_WORKSPACE_PERMISSIONS,
  type ProjectRole,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLE_SUMMARIES,
  PROJECT_ROLES,
  type WorkspaceRole,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLE_SUMMARIES,
  WORKSPACE_ROLES,
  effectiveProjectRole,
  projectRoleCeilingOf,
  workspacePermissionsOf,
} from "@repo/contracts";

export const ROLES_AND_PERMISSIONS_PATH = "/roles-and-permissions";

export interface RolesOverview {
  workspaceRoles: { role: WorkspaceRole; label: string; summary: string }[];
  projectRoles: { role: ProjectRole; label: string; summary: string }[];
  projectAccess: {
    role: WorkspaceRole;
    label: string;
    everyProject: ProjectRole | null;
    highestProjectRole: ProjectRole;
  }[];
  permissionMatrix: {
    permission: EnforcedWorkspacePermission;
    label: string;
    allowed: Record<WorkspaceRole, boolean>;
  }[];
}

/** Nhãn cho người đọc. Thêm quyền vào ENFORCED_WORKSPACE_PERMISSIONS mà thiếu nhãn → lỗi typecheck. */
export const ENFORCED_WORKSPACE_PERMISSION_LABELS = {
  "workspace.settings.update": "Edit workspace settings",
} as const satisfies Record<EnforcedWorkspacePermission, string>;

/** Không nhận tham số: bộ luật giống nhau ở mọi workspace (WEB-F7). */
export function buildRolesOverview(): RolesOverview {
  const workspaceRoles = WORKSPACE_ROLES.map((role) => ({
    role,
    label: WORKSPACE_ROLE_LABELS[role],
    summary: WORKSPACE_ROLE_SUMMARIES[role],
  }));

  const projectRoles = PROJECT_ROLES.map((role) => ({
    role,
    label: PROJECT_ROLE_LABELS[role],
    summary: PROJECT_ROLE_SUMMARIES[role],
  }));

  const projectAccess = WORKSPACE_ROLES.map((role) => ({
    role,
    label: WORKSPACE_ROLE_LABELS[role],
    everyProject: effectiveProjectRole({
      workspaceRole: role,
      assignedRole: null,
    }),
    highestProjectRole: projectRoleCeilingOf(role),
  }));

  const permissionMatrix = ENFORCED_WORKSPACE_PERMISSIONS.map((permission) => {
    const allowed = {} as Record<WorkspaceRole, boolean>;
    for (const role of WORKSPACE_ROLES) {
      allowed[role] = workspacePermissionsOf(role).includes(permission);
    }
    return {
      permission,
      label: ENFORCED_WORKSPACE_PERMISSION_LABELS[permission],
      allowed,
    };
  });

  return {
    workspaceRoles,
    projectRoles,
    projectAccess,
    permissionMatrix,
  };
}
