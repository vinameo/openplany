import {
  assignableProjectRoles,
  effectiveProjectRole,
  isProjectRoleLimited,
  type ProjectAccessPolicies,
  type ProjectActor,
  type ProjectMemberResponse,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';

export interface ProjectMemberDbRow {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  email?: string | null;
  assignedRole: ProjectRole;
  workspaceRole: WorkspaceRole;
  joinedAt: Date | string;
  accountActive: boolean;
}

export function toProjectMemberResponse(
  row: ProjectMemberDbRow,
  opts: {
    actor: ProjectActor;
    includeEmail: boolean;
    policies: ProjectAccessPolicies;
  },
): ProjectMemberResponse {
  const role = effectiveProjectRole(
    {
      workspaceRole: row.workspaceRole,
      assignedRole: row.assignedRole,
    },
    opts.policies,
  )!;
  const roleLimited = isProjectRoleLimited(
    {
      workspaceRole: row.workspaceRole,
      assignedRole: row.assignedRole,
    },
    opts.policies,
  );
  const assignableRoles = assignableProjectRoles(
    opts.actor,
    {
      userId: row.userId,
      workspaceRole: row.workspaceRole,
      assignedRole: row.assignedRole,
    },
    opts.policies,
  );

  const res: ProjectMemberResponse = {
    userId: row.userId,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    displayName: row.displayName ?? '',
    avatarUrl: row.avatarUrl ?? null,
    role,
    assignedRole: row.assignedRole,
    roleLimited,
    joinedAt:
      row.joinedAt instanceof Date
        ? row.joinedAt.toISOString()
        : new Date(row.joinedAt).toISOString(),
    accountActive: row.accountActive,
    source: 'assigned',
    workspaceRole: row.workspaceRole,
    assignableRoles,
  };

  if (opts.includeEmail && typeof row.email === 'string') {
    res.email = row.email;
  }

  return res;
}

export interface InheritedMemberDbRow {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  email?: string | null;
  workspaceRole: WorkspaceRole;
  accountActive: boolean;
}

export function toInheritedProjectMemberResponse(
  row: InheritedMemberDbRow,
  opts: {
    actor?: ProjectActor;
    includeEmail: boolean;
    policies: ProjectAccessPolicies;
  },
): ProjectMemberResponse {
  const role = opts.policies[row.workspaceRole].implicitProjectRole!;
  const res: ProjectMemberResponse = {
    userId: row.userId,
    firstName: row.firstName ?? '',
    lastName: row.lastName ?? '',
    displayName: row.displayName ?? '',
    avatarUrl: row.avatarUrl ?? null,
    role,
    assignedRole: null,
    roleLimited: false,
    joinedAt: null,
    accountActive: row.accountActive,
    source: 'inherited',
    workspaceRole: row.workspaceRole,
    assignableRoles: [],
  };

  if (opts.includeEmail && typeof row.email === 'string') {
    res.email = row.email;
  }

  return res;
}

/**
 * Builds a project member response for any member row (assigned or inherited).
 * Shared by `list`, `add`, and `changeRole`.
 */
export function buildProjectMemberResponse(
  row: ProjectMemberDbRow | InheritedMemberDbRow,
  opts: {
    actor: ProjectActor;
    includeEmail: boolean;
    policies: ProjectAccessPolicies;
  },
): ProjectMemberResponse {
  if ('assignedRole' in row) {
    return toProjectMemberResponse(row, opts);
  }
  return toInheritedProjectMemberResponse(row, opts);
}
