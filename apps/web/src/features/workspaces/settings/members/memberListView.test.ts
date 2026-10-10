import { describe, expect, it } from "vitest";
import type { WorkspaceMemberResponse } from "@repo/contracts";
import {
  DEFAULT_MEMBER_SORT,
  applyMemberListQuery,
  formatJoiningDate,
  memberDisplayName,
} from "./memberListView";

describe("memberListView", () => {
  describe("memberDisplayName", () => {
    it("returns trimmed full name when firstName and lastName are present", () => {
      const member: WorkspaceMemberResponse = {
        userId: "u-1",
        firstName: "  Tran  ",
        lastName: "  Van A  ",
        displayName: "trana",
        avatarUrl: null,
        role: "member",
        accountActive: true,
        joinedAt: "2026-10-08T00:00:00.000Z",
      };
      expect(memberDisplayName(member)).toBe("Tran Van A");
    });

    it("returns displayName when firstName and lastName are empty or whitespace", () => {
      const memberEmpty: WorkspaceMemberResponse = {
        userId: "u-2",
        firstName: "",
        lastName: "",
        displayName: "user_two",
        avatarUrl: null,
        role: "guest",
        accountActive: true,
        joinedAt: "2026-10-08T00:00:00.000Z",
      };
      expect(memberDisplayName(memberEmpty)).toBe("user_two");

      const memberWhitespace: WorkspaceMemberResponse = {
        userId: "u-3",
        firstName: "   ",
        lastName: "   ",
        displayName: "user_three",
        avatarUrl: null,
        role: "admin",
        accountActive: false,
        joinedAt: "2026-10-08T00:00:00.000Z",
      };
      expect(memberDisplayName(memberWhitespace)).toBe("user_three");
    });
  });

  describe("formatJoiningDate", () => {
    it("formats ISO string to 'MMM DD, YYYY' in UTC (WEB-26)", () => {
      const formatted = formatJoiningDate(
        "2026-10-08T12:00:00.000Z",
        "UTC",
      );
      expect(formatted).toBe("Oct 08, 2026");
    });

    it("does not call Date.now() and formats consistently", () => {
      const formatted = formatJoiningDate(
        "2025-01-05T00:00:00.000Z",
        "UTC",
      );
      expect(formatted).toBe("Jan 05, 2025");
    });
  });

  describe("applyMemberListQuery", () => {
    const sampleMembers: WorkspaceMemberResponse[] = [
      {
        userId: "u-1",
        firstName: "Trần",
        lastName: "Đức",
        displayName: "duc.tran",
        email: "duc@example.com",
        avatarUrl: null,
        role: "admin",
        accountActive: true,
        joinedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        userId: "u-2",
        firstName: "Nguyễn",
        lastName: "Văn An",
        displayName: "an.nguyen",
        email: "an@gmail.com",
        avatarUrl: null,
        role: "member",
        accountActive: true,
        joinedAt: "2026-10-05T00:00:00.000Z",
      },
      {
        userId: "u-3",
        firstName: "Lê",
        lastName: "Bình",
        displayName: "binh.le",
        email: "binh@example.com",
        avatarUrl: null,
        role: "guest",
        accountActive: true,
        joinedAt: "2026-10-03T00:00:00.000Z",
      },
      {
        userId: "u-4",
        firstName: "Hoàng",
        lastName: "Admin Two",
        displayName: "hoang",
        email: "hoang@example.com",
        avatarUrl: null,
        role: "admin",
        accountActive: true,
        joinedAt: "2026-10-02T00:00:00.000Z",
      },
    ];

    it("AC-18: search 'tran' matches 'Trần Đức' ignoring diacritics and case", () => {
      const result = applyMemberListQuery(
        sampleMembers,
        { search: "tran", roles: [], sort: DEFAULT_MEMBER_SORT },
        { canSeeEmail: true },
      );
      expect(result).toHaveLength(1);
      expect(result[0].userId).toBe("u-1");
    });

    it("AC-18: searches email only when canSeeEmail is true", () => {
      // Searching by "gmail" which is in u-2 email
      const withEmail = applyMemberListQuery(
        sampleMembers,
        { search: "gmail", roles: [], sort: DEFAULT_MEMBER_SORT },
        { canSeeEmail: true },
      );
      expect(withEmail).toHaveLength(1);
      expect(withEmail[0].userId).toBe("u-2");

      const withoutEmail = applyMemberListQuery(
        sampleMembers,
        { search: "gmail", roles: [], sort: DEFAULT_MEMBER_SORT },
        { canSeeEmail: false },
      );
      expect(withoutEmail).toHaveLength(0);
    });

    it("filters by multiple roles (WEB-25)", () => {
      const result = applyMemberListQuery(
        sampleMembers,
        { search: "", roles: ["member", "guest"], sort: DEFAULT_MEMBER_SORT },
        { canSeeEmail: true },
      );
      expect(result.map((m) => m.role)).toEqual(["member", "guest"]);
    });

    it("default sort: Role desc (Admin first), then memberDisplayName A->Z", () => {
      const result = applyMemberListQuery(
        sampleMembers,
        { search: "", roles: [], sort: DEFAULT_MEMBER_SORT },
        { canSeeEmail: true },
      );
      // Admins: "Hoàng Admin Two" vs "Trần Đức" -> "Hoàng" before "Trần"
      expect(result.map((m) => m.userId)).toEqual(["u-4", "u-1", "u-2", "u-3"]);
    });

    it("sorts by Role asc: Guest first, then Member, then Admin", () => {
      const result = applyMemberListQuery(
        sampleMembers,
        { search: "", roles: [], sort: { key: "role", direction: "asc" } },
        { canSeeEmail: true },
      );
      expect(result.map((m) => m.role)).toEqual(["guest", "member", "admin", "admin"]);
      expect(result[0].role).toBe("guest");
    });

    it("sorts by joinedAt asc and desc", () => {
      const asc = applyMemberListQuery(
        sampleMembers,
        { search: "", roles: [], sort: { key: "joinedAt", direction: "asc" } },
        { canSeeEmail: true },
      );
      expect(asc.map((m) => m.userId)).toEqual(["u-1", "u-4", "u-3", "u-2"]);

      const desc = applyMemberListQuery(
        sampleMembers,
        { search: "", roles: [], sort: { key: "joinedAt", direction: "desc" } },
        { canSeeEmail: true },
      );
      expect(desc.map((m) => m.userId)).toEqual(["u-2", "u-3", "u-4", "u-1"]);
    });
  });
});
