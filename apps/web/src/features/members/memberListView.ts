import type { RoleScheme } from './roleScheme';
import { normalizeForSearch, WORKSPACE_ROLE_RANK } from '@repo/contracts';
import type { SortState } from '../workspaces/table/SortableHeader';
import { formatCalendarDate } from '../workspaces/table/formatCalendarDate';

export type MemberSortKey =
  | 'fullName'
  | 'displayName'
  | 'email'
  | 'role'
  | 'joinedAt';

export type MemberSort = SortState<MemberSortKey>;

export const DEFAULT_MEMBER_SORT = {
  key: 'role',
  direction: 'desc',
} as const satisfies MemberSort;

export interface MemberRowView<R extends string> {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  avatarUrl?: string | null;
  role: R;
  joinedAt: string | null;
  accountActive: boolean;
}

export interface MemberListQuery<R extends string = string> {
  search: string;
  roles: readonly R[];
  sort: MemberSort;
}

/** Full name trimmed; fallback to Display name (RQ A6). */
export function memberDisplayName(member: {
  firstName: string;
  lastName: string;
  displayName: string;
}): string {
  const full = [member.firstName, member.lastName]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(' ');
  return full.length > 0 ? full : member.displayName;
}

export { formatCalendarDate };
/** "Oct 08, 2026", browser timezone (RQ Q-M1, WEB-26). */
export const formatJoiningDate = formatCalendarDate;

const collator = new Intl.Collator('vi', { sensitivity: 'base' });

export function applyMemberListQuery<
  R extends string,
  M extends MemberRowView<R>,
>(
  members: readonly M[],
  query: MemberListQuery<string>,
  opts: { canSeeEmail: boolean; scheme?: RoleScheme<R> },
): M[] {
  // 1. Role filter (WEB-25)
  let result =
    query.roles.length > 0
      ? members.filter((m) => (query.roles as readonly string[]).includes(m.role))
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
  const factor = direction === 'desc' ? -1 : 1;

  return result.toSorted((a, b) => {
    let diff = 0;
    if (key === 'role') {
      const rankA = opts.scheme
        ? opts.scheme.rank[a.role]
        : (WORKSPACE_ROLE_RANK[a.role as keyof typeof WORKSPACE_ROLE_RANK] ?? 0);
      const rankB = opts.scheme
        ? opts.scheme.rank[b.role]
        : (WORKSPACE_ROLE_RANK[b.role as keyof typeof WORKSPACE_ROLE_RANK] ?? 0);
      diff = factor * (rankA - rankB);
    } else if (key === 'joinedAt') {
      if (a.joinedAt === null && b.joinedAt === null) {
        diff = 0;
      } else if (a.joinedAt === null) {
        return 1;
      } else if (b.joinedAt === null) {
        return -1;
      } else {
        diff =
          factor *
          (new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());
      }
    } else if (key === 'fullName') {
      diff =
        factor * collator.compare(memberDisplayName(a), memberDisplayName(b));
    } else if (key === 'displayName') {
      diff = factor * collator.compare(a.displayName, b.displayName);
    } else if (key === 'email') {
      diff = factor * collator.compare(a.email ?? '', b.email ?? '');
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
