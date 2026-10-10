import type { WorkspaceMemberResponse, WorkspaceRole } from "@repo/contracts";
import { normalizeForSearch, WORKSPACE_ROLE_RANK } from "@repo/contracts";

export type MemberSortKey =
  | "fullName"
  | "displayName"
  | "email"
  | "role"
  | "joinedAt";

export interface MemberSort {
  key: MemberSortKey;
  direction: "asc" | "desc";
}

export const DEFAULT_MEMBER_SORT = {
  key: "role",
  direction: "desc",
} as const satisfies MemberSort;

export interface MemberListQuery {
  search: string;
  roles: readonly WorkspaceRole[];
  sort: MemberSort;
}

/** Full name đã trim; rỗng thì Display name (RQ A6). */
export function memberDisplayName(member: WorkspaceMemberResponse): string {
  const full = [member.firstName, member.lastName]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(" ");
  return full.length > 0 ? full : member.displayName;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** "Oct 08, 2026", múi giờ trình duyệt (RQ Q-M1, WEB-26). */
export function formatJoiningDate(iso: string, timeZone?: string): string {
  const key = timeZone ?? "default";
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      ...(timeZone ? { timeZone } : {}),
    });
    formatterCache.set(key, formatter);
  }
  return formatter.format(new Date(iso));
}

const collator = new Intl.Collator("vi", { sensitivity: "base" });

export function applyMemberListQuery(
  members: readonly WorkspaceMemberResponse[],
  query: MemberListQuery,
  opts: { canSeeEmail: boolean },
): WorkspaceMemberResponse[] {
  // 1. Role filter (WEB-25)
  let result =
    query.roles.length > 0
      ? members.filter((m) => query.roles.includes(m.role))
      : [...members];

  // 2. Search filter (WEB-08)
  const trimmedSearch = query.search.trim();
  if (trimmedSearch.length > 0) {
    const q = normalizeForSearch(trimmedSearch);
    result = result.filter((m) => {
      if (normalizeForSearch(memberDisplayName(m)).includes(q)) return true;
      if (normalizeForSearch(m.displayName).includes(q)) return true;
      if (
        opts.canSeeEmail &&
        m.email &&
        normalizeForSearch(m.email).includes(q)
      ) {
        return true;
      }
      return false;
    });
  }

  // 3. Sort (WEB-06)
  const { key, direction } = query.sort;
  const factor = direction === "desc" ? -1 : 1;

  return result.toSorted((a, b) => {
    let diff = 0;
    if (key === "role") {
      diff =
        factor *
        (WORKSPACE_ROLE_RANK[a.role] - WORKSPACE_ROLE_RANK[b.role]);
    } else if (key === "joinedAt") {
      diff =
        factor *
        (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
    } else if (key === "fullName") {
      diff =
        factor * collator.compare(memberDisplayName(a), memberDisplayName(b));
    } else if (key === "displayName") {
      diff = factor * collator.compare(a.displayName, b.displayName);
    } else if (key === "email") {
      diff = factor * collator.compare(a.email ?? "", b.email ?? "");
    }

    if (diff !== 0) return diff;

    // Tie-breaker: memberDisplayName A->Z, then userId (WEB-06)
    const nameDiff = collator.compare(
      memberDisplayName(a),
      memberDisplayName(b),
    );
    if (nameDiff !== 0) return nameDiff;
    return a.userId.localeCompare(b.userId);
  });
}
