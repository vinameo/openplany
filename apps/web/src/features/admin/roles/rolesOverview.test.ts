import { describe, expect, it } from "vitest";
import {
  PROJECT_ROLES,
  WORKSPACE_ROLES,
} from "@repo/contracts";
import { buildRolesOverview } from "./rolesOverview";

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

  it("builds projectAccess according to policy: Admin (admin, admin), Member (null, admin), Guest (null, guest)", () => {
    const overview = buildRolesOverview();

    expect(overview.projectAccess).toEqual([
      {
        role: "admin",
        label: "Admin",
        everyProject: "admin",
        highestProjectRole: "admin",
      },
      {
        role: "member",
        label: "Member",
        everyProject: null,
        highestProjectRole: "admin",
      },
      {
        role: "guest",
        label: "Guest",
        everyProject: null,
        highestProjectRole: "guest",
      },
    ]);
  });
});
