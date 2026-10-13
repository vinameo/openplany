import { describe, expect, it } from "vitest";
import { WORKSPACE_ROLES, type WorkspaceRole } from "./workspace.js";
import { PROJECT_ROLES, type ProjectRole } from "./projectRoles.js";
import type { ProjectRolePermissions } from "./projectPermissions.js";
import {
  effectiveProjectRole,
  isProjectRoleClamped,
  isProjectRoleLimited,
  isProjectRoleOutOfRange,
  resolveProjectAccess,
} from "./projectAccess.js";
import { LEGACY_PROJECT_ACCESS_POLICIES } from "./projectAccessPolicy.js";

describe("projectAccess", () => {
  const allWorkspaceRoles: (WorkspaceRole | null)[] = [
    ...WORKSPACE_ROLES,
    null,
  ];
  const allProjectRoles: (ProjectRole | null)[] = [...PROJECT_ROLES, null];

  // Table A5:
  // | Workspace \ Assigned | null | admin | contributor | commenter | viewer |
  // | admin                | admin| admin | admin       | admin     | admin |
  // | member               | null | admin | contributor | commenter | viewer|
  // | guest                | null | viewer| viewer      | viewer    | viewer|
  // | null                 | null | null  | null        | null      | null  |
  const EXPECTED_A5: Record<string, ProjectRole | null> = {
    "admin:null": "admin",
    "admin:admin": "admin",
    "admin:contributor": "admin",
    "admin:commenter": "admin",
    "admin:viewer": "admin",

    "member:null": null,
    "member:admin": "admin",
    "member:contributor": "contributor",
    "member:commenter": "commenter",
    "member:viewer": "viewer",

    "guest:null": null,
    "guest:admin": "viewer",
    "guest:contributor": "viewer",
    "guest:commenter": "viewer",
    "guest:viewer": "viewer",

    "null:null": null,
    "null:admin": null,
    "null:contributor": null,
    "null:commenter": null,
    "null:viewer": null,
  };

  it("AC-03: effectiveProjectRole matches all combinations in table RQ A5", () => {
    for (const wsRole of allWorkspaceRoles) {
      for (const prRole of allProjectRoles) {
        const key = `${wsRole}:${prRole}`;
        const expected = EXPECTED_A5[key];
        const actual = effectiveProjectRole(
          {
            workspaceRole: wsRole,
            assignedRole: prRole,
          },
          LEGACY_PROJECT_ACCESS_POLICIES,
        );
        expect(actual, `Failed for ${key}`).toBe(expected);
      }
    }
  });

  it("AC-03: isProjectRoleClamped is true exactly for the ✖ cells of table RQ A5", () => {
    for (const wsRole of allWorkspaceRoles) {
      for (const prRole of allProjectRoles) {
        const clamped = isProjectRoleClamped(
          {
            workspaceRole: wsRole,
            assignedRole: prRole,
          },
          LEGACY_PROJECT_ACCESS_POLICIES,
        );
        const limited = isProjectRoleLimited(
          {
            workspaceRole: wsRole,
            assignedRole: prRole,
          },
          LEGACY_PROJECT_ACCESS_POLICIES,
        );
        const isExpectedClamped =
          wsRole === "guest" &&
          (prRole === "admin" ||
            prRole === "contributor" ||
            prRole === "commenter");

        expect(clamped, `Clamp check failed for ${wsRole}:${prRole}`).toBe(
          isExpectedClamped,
        );
        expect(limited, `Limited check failed for ${wsRole}:${prRole}`).toBe(
          isExpectedClamped,
        );
      }
    }
  });

  it("isProjectRoleOutOfRange identifies roles outside policy range or assigned roles for implicit access", () => {
    expect(
      isProjectRoleOutOfRange(
        { workspaceRole: "admin", assignedRole: "admin" },
        LEGACY_PROJECT_ACCESS_POLICIES,
      ),
    ).toBe(true);

    expect(
      isProjectRoleOutOfRange(
        { workspaceRole: "member", assignedRole: "contributor" },
        LEGACY_PROJECT_ACCESS_POLICIES,
      ),
    ).toBe(false);

    expect(
      isProjectRoleOutOfRange(
        { workspaceRole: "guest", assignedRole: "admin" },
        LEGACY_PROJECT_ACCESS_POLICIES,
      ),
    ).toBe(true);

    expect(
      isProjectRoleOutOfRange(
        { workspaceRole: "guest", assignedRole: "viewer" },
        LEGACY_PROJECT_ACCESS_POLICIES,
      ),
    ).toBe(false);
  });

  it("AC-03: resolveProjectAccess returns effective role + full permissions, or null", () => {
    const samplePermissions: ProjectRolePermissions = {
      admin: ["project.settings.update"],
      contributor: ["project.workitems.create"],
      commenter: ["project.comments.create"],
      viewer: ["project.settings.view"],
    };

    const accessMember = resolveProjectAccess(
      {
        workspaceRole: "member",
        assignedRole: "contributor",
      },
      LEGACY_PROJECT_ACCESS_POLICIES,
      samplePermissions,
    );
    expect(accessMember).toEqual({
      role: "contributor",
      permissions: samplePermissions.contributor,
    });

    const accessGuestClamped = resolveProjectAccess(
      {
        workspaceRole: "guest",
        assignedRole: "admin",
      },
      LEGACY_PROJECT_ACCESS_POLICIES,
      samplePermissions,
    );
    expect(accessGuestClamped).toEqual({
      role: "viewer",
      permissions: samplePermissions.viewer,
    });

    const accessNoWs = resolveProjectAccess(
      {
        workspaceRole: null,
        assignedRole: "admin",
      },
      LEGACY_PROJECT_ACCESS_POLICIES,
      samplePermissions,
    );
    expect(accessNoWs).toBeNull();

    const accessMemberUnassigned = resolveProjectAccess(
      {
        workspaceRole: "member",
        assignedRole: null,
      },
      LEGACY_PROJECT_ACCESS_POLICIES,
      samplePermissions,
    );
    expect(accessMemberUnassigned).toBeNull();
  });
});
