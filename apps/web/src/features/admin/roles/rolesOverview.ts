import {
  type ProjectAccessPolicyResponse,
  type ProjectRole,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLE_SUMMARIES,
  PROJECT_ROLES,
  type WorkspaceRole,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  WORKSPACE_ROLE_SUMMARIES,
  WORKSPACE_ROLES,
} from "@repo/contracts";

export const ROLES_AND_PERMISSIONS_PATH = "/roles-and-permissions";

export interface ProjectAccessRow {
  role: WorkspaceRole;
  label: string;
  everyProject: ProjectRole | null;
  lowest: ProjectRole | null;
  highest: ProjectRole | null;
}

export interface RolesOverview {
  workspaceRoles: { role: WorkspaceRole; label: string; summary: string }[];
  projectRoles: { role: ProjectRole; label: string; summary: string }[];
}

/** Không nhận tham số: bộ luật giống nhau ở mọi workspace (WEB-F7). */
export function buildRolesOverview(): RolesOverview {
  const workspaceRoles = WORKSPACE_ROLES.map((role) => ({
    role,
    label: WORKSPACE_ROLE_QUALIFIED_LABELS[role],
    summary: WORKSPACE_ROLE_SUMMARIES[role],
  }));

  const projectRoles = PROJECT_ROLES.map((role) => ({
    role,
    label: PROJECT_ROLE_LABELS[role],
    summary: PROJECT_ROLE_SUMMARIES[role],
  }));

  return {
    workspaceRoles,
    projectRoles,
  };
}

export function buildProjectAccessRows(
  policies: readonly ProjectAccessPolicyResponse[],
): ProjectAccessRow[] {
  return policies.map((p) => ({
    role: p.workspaceRole,
    label: WORKSPACE_ROLE_QUALIFIED_LABELS[p.workspaceRole],
    everyProject: p.implicitProjectRole,
    lowest: p.implicitProjectRole === null ? p.lowestAssignableRole : null,
    highest: p.implicitProjectRole === null ? p.highestAssignableRole : null,
  }));
}
