import { describe, expect, it } from "vitest";
import type { MemberCandidate } from "@repo/contracts";
import {
  addMemberRowsReducer,
  createInitialRow,
  mapFieldErrors,
  toAddMembersRequest,
  type AddMemberRow,
} from "./addMembersRows";

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
      rows = addMemberRowsReducer(rows, { type: "add" }, { defaultRole: "member" });
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
      { id: "row-1", candidate: candidate1, role: "member", error: null },
      { id: "row-2", candidate: null, role: "guest", error: null },
      { id: "row-3", candidate: candidate2, role: "admin", error: null },
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
});

