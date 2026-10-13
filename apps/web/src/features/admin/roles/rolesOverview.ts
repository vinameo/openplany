import {
  type ProjectAccessPolicies,
  type ProjectRole,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLE_SUMMARIES,
  PROJECT_ROLES,
  type WorkspaceRole,
  WORKSPACE_ROLE_QUALIFIED_LABELS,
  WORKSPACE_ROLE_SUMMARIES,
  WORKSPACE_ROLES,
  effectiveProjectRole,
} from "@repo/contracts";

export const ROLES_AND_PERMISSIONS_PATH = "/roles-and-permissions";

/** TEMP until ticket 07 (Roles page loads projectAccessPolicies from API) */
const TEMP_POLICIES: ProjectAccessPolicies = {
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
    label: WORKSPACE_ROLE_QUALIFIED_LABELS[role],
    summary: WORKSPACE_ROLE_SUMMARIES[role],
  }));

  const projectRoles = PROJECT_ROLES.map((role) => ({
    role,
    label: PROJECT_ROLE_LABELS[role],
    summary: PROJECT_ROLE_SUMMARIES[role],
  }));

  const projectAccess = WORKSPACE_ROLES.map((role) => ({
    role,
    label: WORKSPACE_ROLE_QUALIFIED_LABELS[role],
    everyProject: effectiveProjectRole(
      {
        workspaceRole: role,
        assignedRole: null,
      },
      TEMP_POLICIES,
    ),
    highestProjectRole: TEMP_POLICIES[role].highestAssignableRole,
  }));

  return {
    workspaceRoles,
    projectRoles,
    projectAccess,
  };
}
