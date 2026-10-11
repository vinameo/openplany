import { normalizeForSearch, type ProjectListItem } from "@repo/contracts";
import type { SortState } from "../workspaces/table/SortableHeader";

export type ProjectSortKey = "name" | "createdAt";

export const DEFAULT_PROJECT_SORT: SortState<ProjectSortKey> = {
  key: "createdAt",
  direction: "desc",
};

export interface ProjectListQuery {
  search: string;
  sort: SortState<ProjectSortKey>;
}

const nameCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

export function applyProjectListQuery(
  projects: readonly ProjectListItem[],
  query: ProjectListQuery,
): ProjectListItem[] {
  // 1. Search filter
  const trimmed = query.search.trim();
  let result = [...projects];

  if (trimmed.length > 0) {
    const q = normalizeForSearch(trimmed);
    result = result.filter((p) => {
      const matchName = normalizeForSearch(p.name).includes(q);
      const matchId = p.identifier.toLowerCase().includes(q);
      return matchName || matchId;
    });
  }

  // 2. Sort
  const { key, direction } = query.sort;
  const factor = direction === "desc" ? -1 : 1;

  return result.sort((a, b) => {
    if (key === "name") {
      const nameDiff = factor * nameCollator.compare(a.name, b.name);
      if (nameDiff !== 0) return nameDiff;

      // Tie-breaker: createdAt desc, then id
      const dateDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    }

    if (key === "createdAt") {
      const dateDiff =
        factor *
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      if (dateDiff !== 0) return dateDiff;
      return a.id.localeCompare(b.id);
    }

    return 0;
  });
}
