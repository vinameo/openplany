import {
  effectiveProjectRole,
  isProjectRoleClamped,
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
  opts: { includeEmail: boolean },
): ProjectMemberResponse {
  const role = effectiveProjectRole({
    workspaceRole: row.workspaceRole,
    assignedRole: row.assignedRole,
  })!;
  const roleLimited = isProjectRoleClamped({
    workspaceRole: row.workspaceRole,
    assignedRole: row.assignedRole,
  });

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
  };

  if (opts.includeEmail && typeof row.email === 'string') {
    res.email = row.email;
  }

  return res;
}
