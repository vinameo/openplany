import type { WorkspacePermission, WorkspaceResponse } from "@repo/contracts";
import { workspacePermissionsOf } from "@repo/contracts";

export function makeWorkspace(
  overrides: Partial<WorkspaceResponse> = {},
): WorkspaceResponse {
  const role = overrides.role ?? "owner";
  const permissions =
    overrides.permissions ??
    (workspacePermissionsOf(role) as WorkspacePermission[]);

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

