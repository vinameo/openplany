import {
  type WorkspaceResponse,
  enforcedWorkspacePermissions,
} from "@repo/contracts";

export function makeWorkspace(
  overrides: Partial<WorkspaceResponse> = {},
): WorkspaceResponse {
  const role = overrides.role ?? "admin";
  const permissions =
    overrides.permissions ??
    enforcedWorkspacePermissions(
      role === "admin" ? ["workspace.settings.update"] : [],
    );

  return {
    id: "ws-1",
    name: "OpenStudy",
    slug: "openstudy",
    logoUrl: null,
    backgroundColor: "#BE185D",
    organizationSize: "2-10",
    timezone: "UTC",
    role,
    permissions,
    memberCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}
