import { QueryClient } from "@tanstack/react-query";
import {
  PROJECT_MEMBER_LIST_MAX,
  type ProjectListItem,
  type ProjectListResponse,
  type ProjectMemberResponse,
} from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  addProjectMembersToCache,
  addProjectToCache,
  clearProjectMemberCandidates,
  projectKeys,
  removeProjectFromCache,
  replaceProjectInCache,
} from "./projectQueries";
import type { ProjectMemberListResponse } from "@repo/contracts";

function makeItem(id: string, identifier: string, name: string): ProjectListItem {
  return {
    id,
    identifier,
    name,
    description: "",
    icon: { name: "folder", color: "#3b82f6" },
    coverKey: "default",
    permissions: ["project.members.view"],
    role: "admin",
    members: null,
    memberCount: null,
    createdAt: "2026-10-12T00:00:00Z",
    updatedAt: "2026-10-12T00:00:00Z",
    timezone: null,
    effectiveTimezone: "UTC",
  };
}

describe("projectQueries cache helpers", () => {
  const slug = "test-workspace";

  it("addProjectToCache prepends item to list and sets detail", () => {
    const qc = new QueryClient();
    const existingList: ProjectListResponse = {
      projects: [makeItem("1", "P1", "Project 1")],
      total: 1,
      truncated: false,
    };
    qc.setQueryData(projectKeys.list(slug), existingList);

    const newItem = makeItem("2", "P2", "Project 2");
    addProjectToCache(qc, slug, newItem);

    const cachedList = qc.getQueryData<ProjectListResponse>(projectKeys.list(slug));
    expect(cachedList?.total).toBe(2);
    expect(cachedList?.projects[0]?.identifier).toBe("P2");
    expect(cachedList?.projects[1]?.identifier).toBe("P1");

    const cachedDetail = qc.getQueryData<ProjectListItem>(
      projectKeys.detail(slug, "P2"),
    );
    expect(cachedDetail).toEqual(newItem);
  });

  it("replaceProjectInCache updates item in list and detail", () => {
    const qc = new QueryClient();
    const item1 = makeItem("1", "P1", "Old Name");
    qc.setQueryData(projectKeys.list(slug), {
      projects: [item1],
      total: 1,
      truncated: false,
    });
    qc.setQueryData(projectKeys.detail(slug, "P1"), item1);

    const updated = { ...item1, name: "New Name" };
    replaceProjectInCache(qc, slug, updated);

    const cachedList = qc.getQueryData<ProjectListResponse>(projectKeys.list(slug));
    expect(cachedList?.projects[0]?.name).toBe("New Name");

    const cachedDetail = qc.getQueryData<ProjectListItem>(
      projectKeys.detail(slug, "P1"),
    );
    expect(cachedDetail?.name).toBe("New Name");
  });

  it("removeProjectFromCache removes item from list and removes detail query", () => {
    const qc = new QueryClient();
    const item1 = makeItem("1", "P1", "Project 1");
    const item2 = makeItem("2", "P2", "Project 2");
    qc.setQueryData(projectKeys.list(slug), {
      projects: [item1, item2],
      total: 2,
      truncated: false,
    });
    qc.setQueryData(projectKeys.detail(slug, "P1"), item1);

    removeProjectFromCache(qc, slug, "P1");

    const cachedList = qc.getQueryData<ProjectListResponse>(projectKeys.list(slug));
    expect(cachedList?.total).toBe(1);
    expect(cachedList?.projects).toHaveLength(1);
    expect(cachedList?.projects[0]?.identifier).toBe("P2");

    const cachedDetail = qc.getQueryData<ProjectListItem>(
      projectKeys.detail(slug, "P1"),
    );
    expect(cachedDetail).toBeUndefined();
  });

  it("removeProjectFromCache cleans up detail and subqueries like members and memberCandidates", () => {
    const qc = new QueryClient();
    const item1 = makeItem("1", "P1", "Project 1");
    qc.setQueryData(projectKeys.list(slug), {
      projects: [item1],
      total: 1,
      truncated: false,
    });
    qc.setQueryData(projectKeys.detail(slug, "P1"), item1);
    qc.setQueryData(projectKeys.members(slug, "P1"), {
      members: [],
      total: 0,
      truncated: false,
      addableRoles: [],
    });
    qc.setQueryData(projectKeys.memberCandidates(slug, "P1", "test@domain.com"), {
      candidates: [],
    });

    removeProjectFromCache(qc, slug, "P1");

    expect(qc.getQueryData(projectKeys.detail(slug, "P1"))).toBeUndefined();
    expect(qc.getQueryData(projectKeys.members(slug, "P1"))).toBeUndefined();
    expect(
      qc.getQueryData(projectKeys.memberCandidates(slug, "P1", "test@domain.com")),
    ).toBeUndefined();
  });

  it("clearProjectMemberCandidates removes candidate subqueries for project", () => {
    const qc = new QueryClient();
    qc.setQueryData(projectKeys.memberCandidates(slug, "P1", "foo@example.com"), {
      candidates: [],
    });
    qc.setQueryData(projectKeys.memberCandidates(slug, "P1", "bar@example.com"), {
      candidates: [],
    });
    qc.setQueryData(projectKeys.memberCandidates(slug, "P2", "foo@example.com"), {
      candidates: [],
    });

    clearProjectMemberCandidates(qc, slug, "P1");

    expect(
      qc.getQueryData(projectKeys.memberCandidates(slug, "P1", "foo@example.com")),
    ).toBeUndefined();
    expect(
      qc.getQueryData(projectKeys.memberCandidates(slug, "P1", "bar@example.com")),
    ).toBeUndefined();
    expect(
      qc.getQueryData(projectKeys.memberCandidates(slug, "P2", "foo@example.com")),
    ).toBeDefined();
  });

  it("addProjectMembersToCache updates members query, deduping and setting total", () => {
    const qc = new QueryClient();
    const existingMember = {
      userId: "u-1",
      firstName: "User",
      lastName: "One",
      displayName: "User One",
      avatarUrl: null,
      role: "admin" as const,
      assignedRole: "admin" as const,
      accountActive: true,
      roleLimited: false,
      joinedAt: "2026-10-12T00:00:00Z",
    };
    const newMember1 = {
      userId: "u-2",
      firstName: "User",
      lastName: "Two",
      displayName: "User Two",
      avatarUrl: null,
      role: "contributor" as const,
      assignedRole: "contributor" as const,
      accountActive: true,
      roleLimited: false,
      joinedAt: "2026-10-13T00:00:00Z",
    };
    const duplicateMember = {
      ...existingMember,
      role: "contributor" as const,
      assignedRole: "contributor" as const,
    };

    qc.setQueryData(projectKeys.members(slug, "P1"), {
      members: [existingMember],
      total: 1,
      truncated: false,
      addableRoles: ["contributor" as const],
    });

    const projectUpdate = makeItem("1", "P1", "Project 1");
    projectUpdate.memberCount = 2;

    addProjectMembersToCache(qc, slug, "P1", {
      members: [newMember1, duplicateMember],
      project: projectUpdate,
    });

    const cachedMembers = qc.getQueryData<ProjectMemberListResponse>(
      projectKeys.members(slug, "P1"),
    );
    expect(cachedMembers?.members).toHaveLength(2);
    expect(cachedMembers?.members.map((m) => m.userId)).toEqual(["u-1", "u-2"]);
    expect(cachedMembers?.total).toBe(2);
    expect(cachedMembers?.truncated).toBe(false);
    expect(cachedMembers?.addableRoles).toEqual(["contributor"]);
  });

  it("addProjectMembersToCache keeps the list bound and marks it truncated past the cap", () => {
    const qc = new QueryClient();
    const member = (n: number): ProjectMemberResponse => ({
      userId: `u-${n}`,
      firstName: "User",
      lastName: String(n),
      displayName: `User ${n}`,
      avatarUrl: null,
      role: "contributor",
      assignedRole: "contributor",
      accountActive: true,
      roleLimited: false,
      joinedAt: "2026-10-12T00:00:00Z",
    });
    const full = Array.from({ length: PROJECT_MEMBER_LIST_MAX }, (_, i) =>
      member(i),
    );
    qc.setQueryData(projectKeys.members(slug, "P1"), {
      members: full,
      total: PROJECT_MEMBER_LIST_MAX,
      truncated: false,
      addableRoles: ["contributor" as const],
    });

    const projectUpdate = makeItem("1", "P1", "Project 1");
    projectUpdate.memberCount = PROJECT_MEMBER_LIST_MAX + 3;
    addProjectMembersToCache(qc, slug, "P1", {
      members: [1, 2, 3].map((n) => member(PROJECT_MEMBER_LIST_MAX + n)),
      project: projectUpdate,
    });

    const cached = qc.getQueryData<ProjectMemberListResponse>(
      projectKeys.members(slug, "P1"),
    );
    expect(cached?.members).toHaveLength(PROJECT_MEMBER_LIST_MAX);
    expect(cached?.total).toBe(PROJECT_MEMBER_LIST_MAX + 3);
    expect(cached?.truncated).toBe(true);
  });
});
