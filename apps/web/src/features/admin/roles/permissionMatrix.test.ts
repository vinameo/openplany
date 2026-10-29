import { describe, expect, it } from "vitest";
import {
  PERMISSION_GRANT_PROBLEM_REFS,
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
      expect(matrix.roles.map((r) => r.label)).toEqual([
        "Workspace Admin",
        "Member",
        "Guest",
      ]);

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
      expect(matrix.roles.map((r) => r.label)).toEqual([
        "Project Admin",
        "Contributor",
        "Commenter",
        "Viewer",
      ]);

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
          expect(adminCell?.disabledReasonKey).toBe(
            PERMISSION_GRANT_PROBLEM_REFS.ROLE_LOCKED.key,
          );
        }
      }

      const projMatrix = buildPermissionMatrix("project", defaultRoles);
      const projAdminCol = projMatrix.roles.find((r) => r.ref.key === "admin");
      expect(projAdminCol?.locked).toBe(true);
      for (const group of projMatrix.groups) {
        for (const row of group.rows) {
          const adminCell = row.cells.find((c) => c.role.key === "admin");
          expect(adminCell?.disabledReasonKey).toBe(
            PERMISSION_GRANT_PROBLEM_REFS.ROLE_LOCKED.key,
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
      expect(guestCell.disabledReasonKey).toBe(
        PERMISSION_GRANT_PROBLEM_REFS.GUEST_VIEW_ONLY.key,
      );

      // Member: workspace.delete is empty -> G3: ADMIN_ONLY
      const deleteRow = allRows.find(
        (r) => r.permission === "workspace.delete",
      )!;
      const memberDeleteCell = deleteRow.cells.find(
        (c) => c.role.key === "member",
      )!;
      expect(memberDeleteCell.checked).toBe(false);
      expect(memberDeleteCell.disabledReasonKey).toBe(
        PERMISSION_GRANT_PROBLEM_REFS.ADMIN_ONLY.key,
      );

      // Member: workspace.settings.view is checked -> can be toggled off, so disabledReason is null
      const settingsViewRow = allRows.find(
        (r) => r.permission === "workspace.settings.view",
      )!;
      const memberViewCell = settingsViewRow.cells.find(
        (c) => c.role.key === "member",
      )!;
      expect(memberViewCell.checked).toBe(true);
      expect(memberViewCell.disabledReasonKey).toBeNull();
    });

    it("enforces GUEST_VIEW_ONLY for project Viewer role when granting non-view permissions (AC-21)", () => {
      const projMatrix = buildPermissionMatrix("project", defaultRoles);
      const allRows = projMatrix.groups.flatMap((g) => g.rows);

      // Viewer: project.workitems.create (not a view permission) -> GUEST_VIEW_ONLY disabledReason
      const createRow = allRows.find(
        (r) => r.permission === "project.workitems.create",
      )!;
      const viewerCell = createRow.cells.find((c) => c.role.key === "viewer")!;
      expect(viewerCell.checked).toBe(false);
      expect(viewerCell.disabledReasonKey).toBe(
        PERMISSION_GRANT_PROBLEM_REFS.GUEST_VIEW_ONLY.key,
      );
    });

    it("marks enforced permissions accurately from contracts (AC-25, RQ D27, WEB B2.6)", () => {
      const wsMatrix = buildPermissionMatrix(
        "workspace",
        defaultRoles,
        {},
        defaultRolesResponse.permissions,
      );
      const wsRows = wsMatrix.groups.flatMap((g) => g.rows);

      const updateRow = wsRows.find(
        (r) => r.permission === "workspace.settings.update",
      )!;
      expect(updateRow.enforced).toBe(true);

      const statesManageRow = wsRows.find(
        (r) => r.permission === "workspace.states.manage",
      )!;
      expect(statesManageRow.enforced).toBe(true);

      const deleteRow = wsRows.find(
        (r) => r.permission === "workspace.delete",
      )!;
      expect(deleteRow.enforced).toBe(false);

      const projMatrix = buildPermissionMatrix(
        "project",
        defaultRoles,
        {},
        defaultRolesResponse.permissions,
      );
      const projRows = projMatrix.groups.flatMap((g) => g.rows);

      const workItemsViewRow = projRows.find(
        (r) => r.permission === "project.workitems.view",
      )!;
      expect(workItemsViewRow.enforced).toBe(true);

      const statesViewRow = projRows.find(
        (r) => r.permission === "project.states.view",
      )!;
      expect(statesViewRow.enforced).toBe(true);

      const projStatesManageRow = projRows.find(
        (r) => r.permission === "project.states.manage",
      )!;
      expect(projStatesManageRow.enforced).toBe(true);

      const workItemsCreateRow = projRows.find(
        (r) => r.permission === "project.workitems.create",
      )!;
      expect(workItemsCreateRow.enforced).toBe(true);

      const labelsViewRow = projRows.find(
        (r) => r.permission === "project.labels.view",
      )!;
      expect(labelsViewRow.enforced).toBe(false);

      const archiveRow = projRows.find(
        (r) => r.permission === "project.archive",
      )!;
      expect(archiveRow.enforced).toBe(false);
    });
  });

  describe("togglePermission", () => {
    it("adding a permission puts it in draft, toggling off removes role from draft", () => {
      let draft: PermissionDraft = {};
      const memberRole = {
        scope: "workspace" as const,
        key: "member" as const,
      };

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
      const memberRole = {
        scope: "workspace" as const,
        key: "member" as const,
      };

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
