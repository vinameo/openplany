import { describe, expect, it } from "vitest";
import { PROJECT_ROLES, WORKSPACE_ROLES } from "@repo/contracts";
import { DEFAULT_PROJECT_ACCESS_POLICIES } from "@repo/contracts/testing";
import { buildProjectAccessRows, buildRolesOverview } from "./rolesOverview";

describe("buildRolesOverview", () => {
  it("builds overview with 3 workspace roles and 4 project roles in descending rank order", () => {
    const overview = buildRolesOverview();

    expect(overview.workspaceRoles.map((r) => r.role)).toEqual([
      ...WORKSPACE_ROLES,
    ]);
    expect(overview.projectRoles.map((r) => r.role)).toEqual([
      ...PROJECT_ROLES,
    ]);

    for (const r of overview.workspaceRoles) {
      expect(r.label).toBeTruthy();
      expect(r.summary).toBeTruthy();
    }
    for (const r of overview.projectRoles) {
      expect(r.label).toBeTruthy();
      expect(r.summary).toBeTruthy();
    }
  });
});

describe("buildProjectAccessRows", () => {
  it("builds project access rows from policy response: Admin, Member, Guest with 4 columns data", () => {
    const policies = WORKSPACE_ROLES.map((role) => ({
      ...DEFAULT_PROJECT_ACCESS_POLICIES[role],
      locked: true as const,
    }));

    const rows = buildProjectAccessRows(policies);

    expect(rows).toEqual([
      {
        role: "admin",
        label: "Workspace Admin",
        everyProject: "admin",
        lowest: null,
        highest: null,
      },
      {
        role: "member",
        label: "Member",
        everyProject: null,
        lowest: "commenter",
        highest: "admin",
      },
      {
        role: "guest",
        label: "Guest",
        everyProject: null,
        lowest: "viewer",
        highest: "viewer",
      },
    ]);
  });
});
