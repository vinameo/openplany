import type {
  MemberNotAddableReason,
  WorkspaceRole,
  WorkspacePermission,
  ProjectRole,
  WorkspaceRoleChangeEffect,
  WorkspaceRoleChangePreview,
} from '@repo/contracts';
import type {
  MemberCandidateRow,
  WorkspaceMemberRow,
} from './dto/workspaceMemberResponse.dto.js';

export type { MemberCandidateRow };

export type AddMembersResult =
  | { status: 'added'; members: WorkspaceMemberRow[]; reactivatedCount: number }
  | {
      status: 'rejected';
      rows: { index: number; reason: MemberNotAddableReason }[];
    }
  | { status: 'actor_forbidden' }
  /** The database rejected a role of the batch (foreign key on `roles`). */
  | { status: 'role_unknown' }
  | { status: 'workspace_gone' };

export type ChangeRoleResult =
  | {
      status: 'success';
      member: WorkspaceMemberRow;
      fromRole: WorkspaceRole;
      toRole: WorkspaceRole;
      effect: WorkspaceRoleChangeEffect;
      appliedProjectCount: number;
    }
  | { status: 'workspace_gone' }
  | { status: 'member_gone' }
  | { status: 'actor_forbidden' }
  | { status: 'role_changed' }
  | { status: 'same_role' }
  | { status: 'actor_cannot_choose' }
  | { status: 'project_role_out_of_range' }
  | { status: 'last_admin' };

export interface ChangeRoleInput {
  workspaceId: string;
  actorId: string;
  targetUserId: string;
  fromRole: WorkspaceRole;
  toRole: WorkspaceRole;
  projectRole?: ProjectRole | null;
  requestId: string;
  now: Date;
}

/** Same outcomes, same order (RQ INV-11) as `changeRole`; mapped to HTTP in the service. */
export type PreviewRoleChangeResult =
  | { status: 'preview'; preview: WorkspaceRoleChangePreview }
  | { status: 'member_gone' }
  | { status: 'actor_forbidden' }
  | { status: 'same_role' };

export interface PreviewRoleChangeInput {
  workspaceId: string;
  actor: {
    userId: string;
    role: WorkspaceRole;
    permissions: readonly WorkspacePermission[];
  };
  targetUserId: string;
  targetRole: WorkspaceRole;
}

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

  abstract previewRoleChange(
    input: PreviewRoleChangeInput,
  ): Promise<PreviewRoleChangeResult>;

  abstract changeRole(input: ChangeRoleInput): Promise<ChangeRoleResult>;
}
