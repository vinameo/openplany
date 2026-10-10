import {
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
}

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

  return {
    workspaceRoles,
    projectRoles,
    projectAccess,
  };
}
