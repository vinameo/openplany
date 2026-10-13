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

/**
 * Selects the closest permitted role to currentRole (WEB B3.2):
 * 1. Highest permitted role with rank <= currentRole (reason: 'lowered')
 * 2. If none, lowest permitted role with rank > currentRole (reason: 'raised')
 */
export function closestRole<R extends string>(
  scheme: RoleScheme<R>,
  currentRole: R,
  allowedRoles: readonly R[],
): { role: R; reason: 'lowered' | 'raised' } | null {
  if (allowedRoles.length === 0) return null;
  const currentRank = scheme.rank[currentRole];
  const atOrBelow = allowedRoles.filter((r) => scheme.rank[r] <= currentRank);
  if (atOrBelow.length > 0) {
    const highest = atOrBelow.reduce((prev, r) =>
      scheme.rank[r] > scheme.rank[prev] ? r : prev,
    );
    return { role: highest, reason: 'lowered' };
  }
  const lowest = allowedRoles.reduce((prev, r) =>
    scheme.rank[r] < scheme.rank[prev] ? r : prev,
  );
  return { role: lowest, reason: 'raised' };
}
