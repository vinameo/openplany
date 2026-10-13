import { describe, expect, it } from "vitest";
import type { MemberCandidate, ProjectRole } from "@repo/contracts";
import {
  addMemberRowsReducer,
  createInitialRow,
  mapFieldErrors,
  toAddMembersRequest,
  type AddMemberRow,
} from "./addMembersRows";
import { PROJECT_ROLE_SCHEME, highestRole } from "./roleScheme";

describe("addMembersRows", () => {
  const candidate1: MemberCandidate = {
    userId: "u-1",
    email: "u1@example.com",
    firstName: "User",
    lastName: "One",
    displayName: "User One",
    avatarUrl: null,
    alreadyMember: false,
  };

  const candidate2: MemberCandidate = {
    userId: "u-2",
    email: "u2@example.com",
    firstName: "User",
    lastName: "Two",
    displayName: "User Two",
    avatarUrl: null,
    alreadyMember: false,
  };

  it("stops adding at 20 rows (ADD_MEMBERS_MAX)", () => {
    let rows: AddMemberRow[] = [createInitialRow("member")];
    for (let i = 0; i < 25; i++) {
      rows = addMemberRowsReducer(
        rows,
        { type: "add" },
        { defaultRole: "member" },
      );
    }
    expect(rows).toHaveLength(20);
  });

  it("does not remove the last remaining row", () => {
    const initial = [createInitialRow("member")];
    const afterRemove = addMemberRowsReducer(
      initial,
      { type: "remove", id: initial[0]!.id },
      { defaultRole: "member" },
    );
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0]!.id).toBe(initial[0]!.id);
  });

  it("select and role actions clear error on that row (WEB-30)", () => {
    let rows: AddMemberRow[] = [
      {
        id: "row-1",
        candidate: null,
        role: "member",
        error: "Some error",
        roleError: null,
        roleNotice: null,
      },
    ];

    rows = addMemberRowsReducer(
      rows,
      { type: "select", id: "row-1", candidate: candidate1 },
      { defaultRole: "member" },
    );
    expect(rows[0]!.error).toBeNull();
    expect(rows[0]!.candidate).toBe(candidate1);

    rows[0]!.error = "Another error";
    rows = addMemberRowsReducer(
      rows,
      { type: "role", id: "row-1", role: "admin" },
      { defaultRole: "member" },
    );
    expect(rows[0]!.error).toBeNull();
    expect(rows[0]!.role).toBe("admin");
  });

  it("toAddMembersRequest omits empty rows and preserves rowIdByIndex", () => {
    const rows: AddMemberRow[] = [
      {
        id: "row-1",
        candidate: candidate1,
        role: "member",
        error: null,
        roleError: null,
        roleNotice: null,
      },
      {
        id: "row-2",
        candidate: null,
        role: "guest",
        error: null,
        roleError: null,
        roleNotice: null,
      },
      {
        id: "row-3",
        candidate: candidate2,
        role: "admin",
        error: null,
        roleError: null,
        roleNotice: null,
      },
    ];

    const { body, rowIdByIndex } = toAddMembersRequest(rows);

    expect(body.members).toEqual([
      { userId: "u-1", role: "member" },
      { userId: "u-2", role: "admin" },
    ]);
    expect(rowIdByIndex).toEqual(["row-1", "row-3"]);
  });

  it("AC-20: mapFieldErrors maps index to rowId even when an empty row was in between", () => {
    const rowIdByIndex = ["row-1", "row-3"]; // row-2 was empty in UI
    const fields = {
      "members.1.userId": "Already a member of this workspace",
      unrelated: "some other error",
    };

    const mapped = mapFieldErrors(fields, rowIdByIndex);

    expect(mapped).toEqual({
      "row-3": "Already a member of this workspace",
    });
  });

  describe("rolesFor and roleError extensions (AC-13, WEB B3.4)", () => {
    interface ProjectCandidate {
      userId: string;
      addableRoles: ProjectRole[];
    }

    const projectCtx = {
      defaultRole: "contributor" as ProjectRole,
      rolesFor: (c: ProjectCandidate) => c.addableRoles,
      highest: (roles: readonly ProjectRole[]) =>
        highestRole(PROJECT_ROLE_SCHEME, roles),
      limitedNotice: (role: ProjectRole) =>
        `Limited to ${role} by their workspace role.`,
    };

    it("demotes role and sets roleNotice when row role exceeds candidate addableRoles", () => {
      const initialRow: AddMemberRow<ProjectRole, ProjectCandidate> = {
        id: "row-1",
        candidate: null,
        role: "admin",
        error: "prev-err",
        roleError: "prev-role-err",
        roleNotice: null,
      };

      const limitedCandidate: ProjectCandidate = {
        userId: "u-limited",
        addableRoles: ["viewer"],
      };

      const updated = addMemberRowsReducer(
        [initialRow],
        { type: "select", id: "row-1", candidate: limitedCandidate },
        projectCtx,
      );

      expect(updated[0]!.role).toBe("viewer");
      expect(updated[0]!.roleNotice).toBe(
        "Limited to viewer by their workspace role.",
      );
      expect(updated[0]!.error).toBeNull();
      expect(updated[0]!.roleError).toBeNull();
    });

    it("clears roleNotice and errors when deselecting candidate", () => {
      const rowWithNotice: AddMemberRow<ProjectRole, ProjectCandidate> = {
        id: "row-1",
        candidate: { userId: "u-limited", addableRoles: ["viewer"] },
        role: "viewer",
        error: "err",
        roleError: "role-err",
        roleNotice: "Limited to viewer",
      };

      const updated = addMemberRowsReducer(
        [rowWithNotice],
        { type: "select", id: "row-1", candidate: null },
        projectCtx,
      );

      expect(updated[0]!.candidate).toBeNull();
      expect(updated[0]!.roleNotice).toBeNull();
      expect(updated[0]!.error).toBeNull();
      expect(updated[0]!.roleError).toBeNull();
      expect(updated[0]!.role).toBe("viewer"); // role is preserved on deselect
    });

    it("clears roleNotice and roleError on role change", () => {
      const rowWithNotice: AddMemberRow<ProjectRole, ProjectCandidate> = {
        id: "row-1",
        candidate: { userId: "u-1", addableRoles: ["viewer", "contributor"] },
        role: "viewer",
        error: "err",
        roleError: "Role not allowed",
        roleNotice: "Limited to viewer",
      };

      const updated = addMemberRowsReducer(
        [rowWithNotice],
        { type: "role", id: "row-1", role: "contributor" },
        projectCtx,
      );

      expect(updated[0]!.role).toBe("contributor");
      expect(updated[0]!.roleNotice).toBeNull();
      expect(updated[0]!.roleError).toBeNull();
      expect(updated[0]!.error).toBeNull();
    });

    it("maps both .userId and .role field errors to rowId", () => {
      const rowIdByIndex = ["row-1", "row-2"];
      const fields = {
        "members.0.userId": "Already in this project",
        "members.1.role": "You can't assign this role",
      };

      const mapped = mapFieldErrors(fields, rowIdByIndex);

      expect(mapped).toEqual({
        "row-1": { userId: "Already in this project" },
        "row-2": { role: "You can't assign this role" },
      });
    });

    it("handles errors action with object error structure in reducer", () => {
      const initialRow: AddMemberRow<ProjectRole, ProjectCandidate> = {
        id: "row-1",
        candidate: null,
        role: "contributor",
        error: null,
        roleError: null,
        roleNotice: null,
      };

      const updated = addMemberRowsReducer(
        [initialRow],
        {
          type: "errors",
          byRowId: {
            "row-1": {
              userId: "User is invalid",
              role: "Role is invalid",
            },
          },
        },
        projectCtx,
      );

      expect(updated[0]!.error).toBe("User is invalid");
      expect(updated[0]!.roleError).toBe("Role is invalid");
    });
  });
});
