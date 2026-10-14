import { describe, expect, it } from "vitest";
import type { ProjectRole } from "@repo/contracts";
import {
  applyMemberListQuery,
  type MemberRowView,
  type MemberSortKey,
} from "./memberListView";
import { PROJECT_ROLE_SCHEME } from "./roleScheme";

interface TestMember extends MemberRowView<ProjectRole> {
  isPinned?: boolean;
}

const testMembers: TestMember[] = [
  {
    userId: "u-pinned-1",
    firstName: "Lan",
    lastName: "Pham",
    displayName: "lan",
    email: "lan@example.com",
    role: "admin",
    joinedAt: null,
    accountActive: true,
    isPinned: true,
  },
  {
    userId: "u-pinned-2",
    firstName: "Kai",
    lastName: "Tran",
    displayName: "kai",
    email: "kai@example.com",
    role: "admin",
    joinedAt: null,
    accountActive: true,
    isPinned: true,
  },
  {
    userId: "u-assigned-1",
    firstName: "Anh",
    lastName: "Do",
    displayName: "anh",
    email: "anh@example.com",
    role: "admin",
    joinedAt: "2026-10-01T00:00:00.000Z",
    accountActive: true,
    isPinned: false,
  },
  {
    userId: "u-assigned-2",
    firstName: "Bao",
    lastName: "Nguyen",
    displayName: "bao",
    email: "bao@example.com",
    role: "contributor",
    joinedAt: "2026-10-05T00:00:00.000Z",
    accountActive: true,
    isPinned: false,
  },
  {
    userId: "u-assigned-3",
    firstName: "Chi",
    lastName: "Le",
    displayName: "chi",
    email: "chi@example.com",
    role: "viewer",
    joinedAt: "2026-10-03T00:00:00.000Z",
    accountActive: true,
    isPinned: false,
  },
];

describe("applyMemberListQuery", () => {
  it("returns exact same result as without pinned when pinned is not provided", () => {
    const query = {
      search: "",
      roles: [],
      sort: { key: "fullName" as const, direction: "asc" as const },
    };
    const withoutPinned = applyMemberListQuery(testMembers, query, {
      canSeeEmail: true,
      scheme: PROJECT_ROLE_SCHEME,
    });
    const withUndefinedPinned = applyMemberListQuery(testMembers, query, {
      canSeeEmail: true,
      scheme: PROJECT_ROLE_SCHEME,
      pinned: undefined,
    });

    expect(withUndefinedPinned).toEqual(withoutPinned);
  });

  const sortKeys: MemberSortKey[] = [
    "fullName",
    "displayName",
    "email",
    "role",
    "joinedAt",
  ];
  const directions: ("asc" | "desc")[] = ["asc", "desc"];

  for (const key of sortKeys) {
    for (const direction of directions) {
      it(`pins rows to the top for sort key ${key} and direction ${direction}`, () => {
        const query = {
          search: "",
          roles: [],
          sort: { key, direction },
        };
        const result = applyMemberListQuery(testMembers, query, {
          canSeeEmail: true,
          scheme: PROJECT_ROLE_SCHEME,
          pinned: (m) => m.isPinned === true,
        });

        // The first 2 items must be the pinned members
        expect(result).toHaveLength(5);
        expect(result[0].isPinned).toBe(true);
        expect(result[1].isPinned).toBe(true);
        expect(result[2].isPinned).toBe(false);
        expect(result[3].isPinned).toBe(false);
        expect(result[4].isPinned).toBe(false);

        // Inside each group, ordering matches the sort query without pinned
        const pinnedOnly = applyMemberListQuery(
          testMembers.filter((m) => m.isPinned),
          query,
          { canSeeEmail: true, scheme: PROJECT_ROLE_SCHEME },
        );
        const unpinnedOnly = applyMemberListQuery(
          testMembers.filter((m) => !m.isPinned),
          query,
          { canSeeEmail: true, scheme: PROJECT_ROLE_SCHEME },
        );

        expect(result.slice(0, 2).map((m) => m.userId)).toEqual(
          pinnedOnly.map((m) => m.userId),
        );
        expect(result.slice(2).map((m) => m.userId)).toEqual(
          unpinnedOnly.map((m) => m.userId),
        );
      });
    }
  }

  it("applies search to both pinned and unpinned rows", () => {
    // Search matching a pinned member
    const searchPinned = applyMemberListQuery(
      testMembers,
      {
        search: "kai",
        roles: [],
        sort: { key: "fullName", direction: "asc" },
      },
      {
        canSeeEmail: true,
        scheme: PROJECT_ROLE_SCHEME,
        pinned: (m) => m.isPinned === true,
      },
    );
    expect(searchPinned).toHaveLength(1);
    expect(searchPinned[0].userId).toBe("u-pinned-2");

    // Search matching an unpinned member
    const searchUnpinned = applyMemberListQuery(
      testMembers,
      {
        search: "bao",
        roles: [],
        sort: { key: "fullName", direction: "asc" },
      },
      {
        canSeeEmail: true,
        scheme: PROJECT_ROLE_SCHEME,
        pinned: (m) => m.isPinned === true,
      },
    );
    expect(searchUnpinned).toHaveLength(1);
    expect(searchUnpinned[0].userId).toBe("u-assigned-2");
  });

  it("applies role filter to both pinned and unpinned rows", () => {
    // Filtering by admin matches both pinned and unpinned admins
    const filterAdmin = applyMemberListQuery(
      testMembers,
      {
        search: "",
        roles: ["admin"],
        sort: { key: "fullName", direction: "asc" },
      },
      {
        canSeeEmail: true,
        scheme: PROJECT_ROLE_SCHEME,
        pinned: (m) => m.isPinned === true,
      },
    );
    expect(filterAdmin).toHaveLength(3);
    expect(filterAdmin[0].isPinned).toBe(true);
    expect(filterAdmin[1].isPinned).toBe(true);
    expect(filterAdmin[2].userId).toBe("u-assigned-1");

    // Filtering by contributor matches only unpinned contributor
    const filterContributor = applyMemberListQuery(
      testMembers,
      {
        search: "",
        roles: ["contributor"],
        sort: { key: "fullName", direction: "asc" },
      },
      {
        canSeeEmail: true,
        scheme: PROJECT_ROLE_SCHEME,
        pinned: (m) => m.isPinned === true,
      },
    );
    expect(filterContributor).toHaveLength(1);
    expect(filterContributor[0].userId).toBe("u-assigned-2");
  });
});
