import { QueryClient } from "@tanstack/react-query";
import type {
  WorkspaceMemberListResponse,
  WorkspaceMemberResponse,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  addWorkspaceMembersToCache,
  clearWorkspaceMemberCandidates,
  replaceWorkspaceMemberInCache,
  workspaceMemberKeys,
} from "./workspaceMemberQueries";

describe("workspaceMemberQueries", () => {
  it("generates consistent query keys", () => {
    expect(workspaceMemberKeys.list("acme")).toEqual([
      "workspaces",
      "acme",
      "members",
    ]);
    expect(workspaceMemberKeys.candidates("acme")).toEqual([
      "workspaces",
      "acme",
      "member-candidates",
    ]);
    expect(workspaceMemberKeys.candidates("acme", "alice")).toEqual([
      "workspaces",
      "acme",
      "member-candidates",
      "alice",
    ]);
    expect(
      workspaceMemberKeys.roleChangePreview("acme", "user-1", "member"),
    ).toEqual([
      "workspaces",
      "acme",
      "members",
      "user-1",
      "role-change-preview",
      "member",
    ]);
  });

  it("replaceWorkspaceMemberInCache updates existing member in query cache", () => {
    const qc = new QueryClient();
    const initial: WorkspaceMemberListResponse = {
      members: [
        {
          userId: "u-1",
          firstName: "Alice",
          lastName: "A",
          displayName: "alice",
          role: "guest",
          joinedAt: "2026-10-01T00:00:00Z",
          accountActive: true,
          avatarUrl: null,
        },
      ],
      total: 1,
      truncated: false,
      addableRoles: ["admin", "member"],
    };

    qc.setQueryData(workspaceMemberKeys.list("acme"), initial);

    replaceWorkspaceMemberInCache(qc, "acme", {
      ...initial.members[0]!,
      role: "member",
    });

    const updated = qc.getQueryData<WorkspaceMemberListResponse>(
      workspaceMemberKeys.list("acme"),
    );
    expect(updated?.members[0]?.role).toBe("member");
  });

  it("addWorkspaceMembersToCache appends members, increments total and dedupes", () => {
    const qc = new QueryClient();
    const existing: WorkspaceMemberResponse = {
      userId: "u-1",
      firstName: "Alice",
      lastName: "A",
      displayName: "alice",
      role: "admin",
      joinedAt: "2026-10-01T00:00:00Z",
      accountActive: true,
      avatarUrl: null,
    };
    const initial: WorkspaceMemberListResponse = {
      members: [existing],
      total: 1,
      truncated: false,
      addableRoles: ["admin", "member"],
    };

    qc.setQueryData(workspaceMemberKeys.list("acme"), initial);

    const newMember: WorkspaceMemberResponse = {
      userId: "u-2",
      firstName: "Bob",
      lastName: "B",
      displayName: "bob",
      role: "member",
      joinedAt: "2026-10-02T00:00:00Z",
      accountActive: true,
      avatarUrl: null,
    };

    addWorkspaceMembersToCache(qc, "acme", [existing, newMember]);

    const updated = qc.getQueryData<WorkspaceMemberListResponse>(
      workspaceMemberKeys.list("acme"),
    );
    expect(updated?.total).toBe(3); // total += added.length
    expect(updated?.members).toHaveLength(2); // deduped by userId
    expect(updated?.members.map((m) => m.userId)).toEqual(["u-1", "u-2"]);
  });

  it("clearWorkspaceMemberCandidates removes candidates queries", () => {
    const qc = new QueryClient();
    qc.setQueryData(workspaceMemberKeys.candidates("acme", "al"), {
      candidates: [],
    });
    expect(
      qc.getQueryData(workspaceMemberKeys.candidates("acme", "al")),
    ).toBeDefined();

    clearWorkspaceMemberCandidates(qc, "acme");
    expect(
      qc.getQueryData(workspaceMemberKeys.candidates("acme", "al")),
    ).toBeUndefined();
  });
});
