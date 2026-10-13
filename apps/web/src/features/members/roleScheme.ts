import {
  PROJECT_ROLE_LABELS,
  PROJECT_ROLE_RANK,
  PROJECT_ROLES,
  type ProjectRole,
  WORKSPACE_ROLE_LABELS,
  WORKSPACE_ROLE_RANK,
  WORKSPACE_ROLES,
  type WorkspaceRole,
} from '@repo/contracts';

export interface RoleScheme<R extends string> {
  roles: readonly R[];
  rank: Readonly<Record<R, number>>;
  labels: Readonly<Record<R, string>>;
}

export const WORKSPACE_ROLE_SCHEME: RoleScheme<WorkspaceRole> = {
  roles: WORKSPACE_ROLES,
  rank: WORKSPACE_ROLE_RANK,
  labels: WORKSPACE_ROLE_LABELS,
};

export const PROJECT_ROLE_SCHEME: RoleScheme<ProjectRole> = {
  roles: PROJECT_ROLES,
  rank: PROJECT_ROLE_RANK,
  labels: PROJECT_ROLE_LABELS,
};

/**
 * Sorts roles by rank ascending (e.g. guest -> member -> admin).
 */
export function sortRolesAscending<R extends string>(
  scheme: RoleScheme<R>,
  roles: readonly R[],
): R[] {
  return [...roles].sort((a, b) => scheme.rank[a] - scheme.rank[b]);
}

/**
 * Returns the highest ranking role among the given list, or null if empty.
 */
export function highestRole<R extends string>(
  scheme: RoleScheme<R>,
  roles: readonly R[],
): R | null {
  if (roles.length === 0) return null;
  return roles.reduce((highest, r) =>
    scheme.rank[r] > scheme.rank[highest] ? r : highest,
  );
}

/**
 * Returns true if the role has the highest rank in the scheme (e.g. admin).
 */
export function isTopRole<R extends string>(
  scheme: RoleScheme<R>,
  role: R,
): boolean {
  const maxRank = Math.max(...scheme.roles.map((r) => scheme.rank[r]));
  return scheme.rank[role] === maxRank;
}
