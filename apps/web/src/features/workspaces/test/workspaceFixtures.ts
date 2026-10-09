import type { WorkspaceResponse } from "@repo/contracts";
import { enforcedWorkspacePermissionsOf } from "@repo/contracts";

export function makeWorkspace(
  overrides: Partial<WorkspaceResponse> = {},
): WorkspaceResponse {
  const role = overrides.role ?? "owner";
  const permissions =
    overrides.permissions ?? enforcedWorkspacePermissionsOf(role);

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
