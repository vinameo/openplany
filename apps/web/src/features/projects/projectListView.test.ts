import type { ProjectListItem } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  applyProjectListQuery,
  DEFAULT_PROJECT_SORT,
} from "./projectListView";

function makeProject(
  id: string,
  name: string,
  identifier: string,
  createdAt: string,
): ProjectListItem {
  return {
    id,
    name,
    identifier,
    description: "",
    icon: { name: "folder", color: "#4F46E5" },
    coverKey: "cover_1",
    role: "admin",
    permissions: ["project.members.view"],
    members: null,
    createdAt,
  };
}

describe("projectListView", () => {
  const p1 = makeProject("p-1", "Dự án Mobile", "DAM", "2026-10-10T10:00:00Z");
  const p2 = makeProject("p-2", "Web Frontend", "WEB", "2026-10-11T12:00:00Z");
  const p3 = makeProject("p-3", "Backend Core", "BEC", "2026-10-09T08:00:00Z");
  const projects = [p1, p2, p3];

  it("does not mutate the input array", () => {
    const frozenProjects = Object.freeze([...projects]);
    const result = applyProjectListQuery(frozenProjects, {
      search: "",
      sort: DEFAULT_PROJECT_SORT,
    });
    expect(result).not.toBe(frozenProjects);
    expect(result).toHaveLength(3);
  });

  it("filters accent-insensitively (e.g. 'du an' matches 'Dự án Mobile')", () => {
    const result = applyProjectListQuery(projects, {
      search: "du an",
      sort: DEFAULT_PROJECT_SORT,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p-1");
  });

  it("filters case-insensitively by Project ID (e.g. 'dam' matches 'DAM')", () => {
    const result = applyProjectListQuery(projects, {
      search: "dam",
      sort: DEFAULT_PROJECT_SORT,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p-1");
  });

  it("filters case-insensitively by Project ID prefix (e.g. 'we' matches 'WEB')", () => {
    const result = applyProjectListQuery(projects, {
      search: "we",
      sort: DEFAULT_PROJECT_SORT,
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p-2");
  });

  it("returns empty array when search query matches nothing", () => {
    const result = applyProjectListQuery(projects, {
      search: "xyz123",
      sort: DEFAULT_PROJECT_SORT,
    });
    expect(result).toHaveLength(0);
  });

  it("sorts by createdAt descending by default (newest first)", () => {
    const result = applyProjectListQuery(projects, {
      search: "",
      sort: { key: "createdAt", direction: "desc" },
    });
    expect(result.map((p) => p.id)).toEqual(["p-2", "p-1", "p-3"]);
  });

  it("sorts by createdAt ascending (oldest first)", () => {
    const result = applyProjectListQuery(projects, {
      search: "",
      sort: { key: "createdAt", direction: "asc" },
    });
    expect(result.map((p) => p.id)).toEqual(["p-3", "p-1", "p-2"]);
  });

  it("AC-26: sorts by name with sensitivity base ('an', 'Ánh', 'Bình')", () => {
    const vnProjects = [
      makeProject("1", "Bình", "BINH", "2026-10-01T00:00:00Z"),
      makeProject("2", "Ánh", "ANH", "2026-10-02T00:00:00Z"),
      makeProject("3", "an", "AN", "2026-10-03T00:00:00Z"),
    ];

    const result = applyProjectListQuery(vnProjects, {
      search: "",
      sort: { key: "name", direction: "asc" },
    });

    const names = result.map((p) => p.name.toLowerCase());
    // "an" and "ánh" come before "bình"
    expect(names[2]).toBe("bình");
  });

  it("sorts by name descending", () => {
    const result = applyProjectListQuery(projects, {
      search: "",
      sort: { key: "name", direction: "desc" },
    });
    expect(result.map((p) => p.id)).toEqual(["p-2", "p-1", "p-3"]);
  });

  it("breaks ties by createdAt desc, then id when sorting by name", () => {
    const dup1 = makeProject("a-id", "Same Name", "ID1", "2026-10-01T00:00:00Z");
    const dup2 = makeProject("b-id", "Same Name", "ID2", "2026-10-02T00:00:00Z");

    const result = applyProjectListQuery([dup1, dup2], {
      search: "",
      sort: { key: "name", direction: "asc" },
    });
    // Newer createdAt first in tie
    expect(result[0]!.id).toBe("b-id");
    expect(result[1]!.id).toBe("a-id");
  });
});
