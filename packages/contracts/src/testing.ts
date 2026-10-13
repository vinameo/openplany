import type { ProjectAccessPolicies } from "./projectAccessPolicy.js";

/** Giá trị seed của migration. CHỈ dùng trong test và để so với DB khi test migration (INV-01). */
export const DEFAULT_PROJECT_ACCESS_POLICIES = {
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
    lowestAssignableRole: "commenter",
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
} as const satisfies ProjectAccessPolicies;
