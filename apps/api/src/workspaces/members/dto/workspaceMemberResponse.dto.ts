import type { WorkspaceMemberResponse, WorkspaceRole } from '@repo/contracts';

export interface WorkspaceMemberRow {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: Date;
  accountActive: boolean;
}

export function toWorkspaceMemberResponse(
  row: WorkspaceMemberRow,
  opts: { includeEmail: boolean },
): WorkspaceMemberResponse {
  const res: WorkspaceMemberResponse = {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    role: row.role,
    joinedAt: new Date(row.joinedAt).toISOString(),
    accountActive: row.accountActive,
  };

  if (opts.includeEmail && row.email !== null && row.email !== undefined) {
    res.email = row.email;
  }

  return res;
}

