import { describe, expect, it } from "vitest";
import {
  ENFORCED_WORKSPACE_PERMISSIONS,
  PROJECT_ROLES,
  WORKSPACE_ROLES,
} from "@repo/contracts";
import {
  buildRolesOverview,
  ENFORCED_WORKSPACE_PERMISSION_LABELS,
} from "./rolesOverview";

describe("buildRolesOverview", () => {
  it("builds overview with 4 workspace roles and 4 project roles in descending rank order", () => {
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

  it("builds projectAccess according to policy: Owner/Admin (admin, admin), Member (null, admin), Guest (null, guest)", () => {
    const overview = buildRolesOverview();

    expect(overview.projectAccess).toEqual([
      {
        role: "owner",
        label: "Owner",
        everyProject: "admin",
        highestProjectRole: "admin",
      },
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

  it("builds permissionMatrix for enforced permissions with Owner/Admin true, Member/Guest false", () => {
    const overview = buildRolesOverview();

    expect(overview.permissionMatrix).toHaveLength(1);
    const row = overview.permissionMatrix[0]!;
    expect(row.permission).toBe("workspace.settings.update");
    expect(row.label).toBe("Edit workspace settings");
    expect(row.allowed).toEqual({
      owner: true,
      admin: true,
      member: false,
      guest: false,
    });
  });

  it("every enforced workspace permission has a human-readable label", () => {
    for (const perm of ENFORCED_WORKSPACE_PERMISSIONS) {
      expect(ENFORCED_WORKSPACE_PERMISSION_LABELS[perm]).toBeTruthy();
    }
  });
});
