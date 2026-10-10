import { describe, expect, it } from "vitest";
import {
  PERMISSION_GRANT_PROBLEM_MESSAGES,
  PROJECT_ROLES,
  WORKSPACE_ROLES,
} from "@repo/contracts";
import { makeDefaultRolesResponse } from "./test/rolesFixtures";
import {
  buildPermissionMatrix,
  diffDraft,
  type PermissionDraft,
  togglePermission,
  toUpdateRequest,
} from "./permissionMatrix";

describe("permissionMatrix", () => {
  const defaultRolesResponse = makeDefaultRolesResponse();
  const defaultRoles = defaultRolesResponse.roles;

  describe("buildPermissionMatrix", () => {
    it("orders roles and permissions according to catalog order for workspace", () => {
      const matrix = buildPermissionMatrix(
        "workspace",
        defaultRoles,
        {},
        defaultRolesResponse.permissions,
      );

      expect(matrix.scope).toBe("workspace");
      expect(matrix.roles.map((r) => r.ref.key)).toEqual([...WORKSPACE_ROLES]);

      const expectedWsPerms = defaultRolesResponse.permissions
        .filter((p) => p.scope === "workspace")
        .map((p) => p.key);
      const allRows = matrix.groups.flatMap((g) => g.rows);
      expect(allRows.map((r) => r.permission)).toEqual(expectedWsPerms);
    });

    it("orders roles and permissions according to catalog order for project", () => {
      const matrix = buildPermissionMatrix(
        "project",
        defaultRoles,
        {},
        defaultRolesResponse.permissions,
      );

      expect(matrix.scope).toBe("project");
      expect(matrix.roles.map((r) => r.ref.key)).toEqual([...PROJECT_ROLES]);

      const expectedProjPerms = defaultRolesResponse.permissions
        .filter((p) => p.scope === "project")
        .map((p) => p.key);
      const allRows = matrix.groups.flatMap((g) => g.rows);
      expect(allRows.map((r) => r.permission)).toEqual(expectedProjPerms);
    });

    it("resolves row labels using permissions from API", () => {
      const defaultResponse = makeDefaultRolesResponse();
      const wsMatrix = buildPermissionMatrix(
        "workspace",
        defaultResponse.roles,
        {},
        defaultResponse.permissions,
      );
      const settingsRow = wsMatrix.groups
        .flatMap((g) => g.rows)
        .find((r) => r.permission === "workspace.settings.view");
      expect(settingsRow?.label).toBe("View workspace settings");
    });

    it("resolves project permission labels from API permissions", () => {
      const defaultResponse = makeDefaultRolesResponse();
      const projMatrix = buildPermissionMatrix(
        "project",
        defaultResponse.roles,
        {},
        defaultResponse.permissions,
      );
      const projSettingsRow = projMatrix.groups
        .flatMap((g) => g.rows)
        .find((r) => r.permission === "project.settings.view");
      expect(projSettingsRow?.label).toBe("View project settings");
    });

    it("falls back to permission key when label is missing", () => {
      const defaultResponse = makeDefaultRolesResponse();
      const wsMatrix = buildPermissionMatrix(
        "workspace",
        defaultResponse.roles,
        {},
        [], // empty permissions array from API
      );
      const settingsRow = wsMatrix.groups
        .flatMap((g) => g.rows)
        .find((r) => r.permission === "workspace.settings.view");
      expect(settingsRow?.label).toBe("workspace.settings.view");
    });

    it("accepts permissions array directly as 3rd argument without draft", () => {
      const defaultResponse = makeDefaultRolesResponse();
      const wsMatrix = buildPermissionMatrix(
        "workspace",
        defaultResponse.roles,
        defaultResponse.permissions,
      );
      const settingsRow = wsMatrix.groups
        .flatMap((g) => g.rows)
        .find((r) => r.permission === "workspace.settings.view");
      expect(settingsRow?.label).toBe("View workspace settings");
    });

    it("marks Admin roles as locked with ROLE_LOCKED disabledReason", () => {
      const wsMatrix = buildPermissionMatrix("workspace", defaultRoles);
      const adminCol = wsMatrix.roles.find((r) => r.ref.key === "admin");
      expect(adminCol?.locked).toBe(true);

      for (const group of wsMatrix.groups) {
        for (const row of group.rows) {
          const adminCell = row.cells.find((c) => c.role.key === "admin");
          expect(adminCell?.disabledReason).toBe(
            PERMISSION_GRANT_PROBLEM_MESSAGES.ROLE_LOCKED,
          );
        }
      }

      const projMatrix = buildPermissionMatrix("project", defaultRoles);
      const projAdminCol = projMatrix.roles.find((r) => r.ref.key === "admin");
      expect(projAdminCol?.locked).toBe(true);
      for (const group of projMatrix.groups) {
        for (const row of group.rows) {
          const adminCell = row.cells.find((c) => c.role.key === "admin");
          expect(adminCell?.disabledReason).toBe(
            PERMISSION_GRANT_PROBLEM_MESSAGES.ROLE_LOCKED,
          );
        }
      }
    });

    it("enforces correct guardrails for empty cells and null for checked cells", () => {
      const matrix = buildPermissionMatrix("workspace", defaultRoles);
      const allRows = matrix.groups.flatMap((g) => g.rows);

      // Guest: workspace.settings.update (not .view) is empty -> G4: GUEST_VIEW_ONLY
      const settingsUpdateRow = allRows.find(
        (r) => r.permission === "workspace.settings.update",
      )!;
      const guestCell = settingsUpdateRow.cells.find(
        (c) => c.role.key === "guest",
      )!;
      expect(guestCell.checked).toBe(false);
      expect(guestCell.disabledReason).toBe(
        PERMISSION_GRANT_PROBLEM_MESSAGES.GUEST_VIEW_ONLY,
      );

      // Member: workspace.delete is empty -> G3: ADMIN_ONLY
      const deleteRow = allRows.find(
        (r) => r.permission === "workspace.delete",
      )!;
      const memberDeleteCell = deleteRow.cells.find(
        (c) => c.role.key === "member",
      )!;
      expect(memberDeleteCell.checked).toBe(false);
      expect(memberDeleteCell.disabledReason).toBe(
        PERMISSION_GRANT_PROBLEM_MESSAGES.ADMIN_ONLY,
      );

      // Member: workspace.settings.view is checked -> can be toggled off, so disabledReason is null
      const settingsViewRow = allRows.find(
        (r) => r.permission === "workspace.settings.view",
      )!;
      const memberViewCell = settingsViewRow.cells.find(
        (c) => c.role.key === "member",
      )!;
      expect(memberViewCell.checked).toBe(true);
      expect(memberViewCell.disabledReason).toBeNull();
    });

    it("marks enforced permissions accurately", () => {
      const wsMatrix = buildPermissionMatrix("workspace", defaultRoles);
      const allRows = wsMatrix.groups.flatMap((g) => g.rows);

      const updateRow = allRows.find(
        (r) => r.permission === "workspace.settings.update",
      )!;
      expect(updateRow.enforced).toBe(true);

      const deleteRow = allRows.find(
        (r) => r.permission === "workspace.delete",
      )!;
      expect(deleteRow.enforced).toBe(false);
    });
  });

  describe("togglePermission", () => {
    it("adding a permission puts it in draft, toggling off removes role from draft", () => {
      let draft: PermissionDraft = {};
      const memberRole = { scope: "workspace" as const, key: "member" as const };

      // Member currently does not have workspace.settings.update
      draft = togglePermission(
        draft,
        defaultRoles,
        memberRole,
        "workspace.settings.update",
      );
      expect(draft["workspace.member"]).toContain("workspace.settings.update");

      // Toggling it back off restores server set and draft becomes empty
      draft = togglePermission(
        draft,
        defaultRoles,
        memberRole,
        "workspace.settings.update",
      );
      expect(draft).toEqual({});
    });
  });

  describe("diffDraft and toUpdateRequest", () => {
    it("diffDraft lists granted and revoked correctly and toUpdateRequest sends full set + server version", () => {
      let draft: PermissionDraft = {};
      const memberRole = { scope: "workspace" as const, key: "member" as const };

      // Member: add workspace.settings.update, remove workspace.settings.view
      draft = togglePermission(
        draft,
        defaultRoles,
        memberRole,
        "workspace.settings.update",
      );
      draft = togglePermission(
        draft,
        defaultRoles,
        memberRole,
        "workspace.settings.view",
      );

      const diff = diffDraft(defaultRoles, draft);
      expect(diff).toHaveLength(1);
      expect(diff[0]?.role).toEqual(memberRole);
      expect(diff[0]?.granted).toEqual(["workspace.settings.update"]);
      expect(diff[0]?.revoked).toEqual(["workspace.settings.view"]);

      const updateReq = toUpdateRequest(defaultRoles, draft);
      expect(updateReq.changes).toHaveLength(1);
      const change = updateReq.changes[0]!;
      expect(change.scope).toBe("workspace");
      expect(change.key).toBe("member");
      expect(change.version).toBe(1);
      expect(change.permissions).toContain("workspace.settings.update");
      expect(change.permissions).not.toContain("workspace.settings.view");
    });
  });
});

