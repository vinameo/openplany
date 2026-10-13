import type {
  MemberNotAddableReason,
  WorkspaceRole,
  WorkspacePermission,
} from '@repo/contracts';
import type {
  MemberCandidateRow,
  WorkspaceMemberRow,
} from './dto/workspaceMemberResponse.dto.js';

export type { MemberCandidateRow };

export type AddMembersResult =
  | { status: 'added'; members: WorkspaceMemberRow[]; reactivatedCount: number }
  | { status: 'rejected'; rows: { index: number; reason: MemberNotAddableReason }[] }
  | { status: 'actor_forbidden' }
  /** The database rejected a role of the batch (foreign key on `roles`). */
  | { status: 'role_unknown' }
  | { status: 'workspace_gone' };

export abstract class WorkspaceMembersRepository {
  abstract list(
    workspaceId: string,
    opts: {
      includeEmail: boolean;
      roleOrder: readonly WorkspaceRole[];
      limit: number;
    },
  ): Promise<{ members: WorkspaceMemberRow[]; total: number }>;

  abstract searchCandidates(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<MemberCandidateRow[]>;

  abstract addMembers(input: {
    workspaceId: string;
    actorId: string;
    requestId: string;
    now: Date;
    members: readonly { userId: string; role: WorkspaceRole }[];
    canAdd: (actor: {
      role: WorkspaceRole;
      permissions: readonly WorkspacePermission[];
    }) => boolean;
  }): Promise<AddMembersResult>;
}
