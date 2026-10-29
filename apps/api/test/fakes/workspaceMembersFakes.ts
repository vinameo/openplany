import type { WorkspaceRole } from '@repo/contracts';
import {
  WorkspaceMembersRepository,
  type MemberCandidateRow,
  type AddMembersResult,
} from '../../src/workspaces/members/workspaceMembers.repository.js';
import type { WorkspaceMemberRow } from '../../src/workspaces/members/dto/workspaceMemberResponse.dto.js';

export class FakeWorkspaceMembersRepository extends WorkspaceMembersRepository {
  public membersByWorkspace = new Map<string, WorkspaceMemberRow[]>();
  public totalOverride?: number;
  public candidates: MemberCandidateRow[] = [];
  public lastSearchQuery?: string;
  public addMembersResult?: AddMembersResult;
  public addMembersInput?: unknown;

  async list(
    workspaceId: string,
    opts: {
      includeEmail: boolean;
      roleOrder: readonly WorkspaceRole[];
      limit: number;
    },
  ): Promise<{ members: WorkspaceMemberRow[]; total: number }> {
    const list = this.membersByWorkspace.get(workspaceId) ?? [];
    const total = this.totalOverride ?? list.length;
    const sliced = list.slice(0, opts.limit);
    const members = sliced.map((m) => ({
      ...m,
      email: opts.includeEmail ? m.email : null,
    }));
    return { members, total };
  }

  async searchCandidates(
    _workspaceId: string,
    query: string,
    limit: number,
  ): Promise<MemberCandidateRow[]> {
    this.lastSearchQuery = query;
    return this.candidates.slice(0, limit);
  }

  async addMembers(
    input: Parameters<WorkspaceMembersRepository['addMembers']>[0],
  ): Promise<AddMembersResult> {
    this.addMembersInput = input;
    return (
      this.addMembersResult ?? {
        status: 'added',
        members: [],
        reactivatedCount: 0,
      }
    );
  }

  public previewRoleChangeResult?: Awaited<
    ReturnType<WorkspaceMembersRepository['previewRoleChange']>
  >;
  public previewRoleChangeInput?: unknown;
  public changeRoleResult?: Awaited<
    ReturnType<WorkspaceMembersRepository['changeRole']>
  >;
  public changeRoleInput?: unknown;

  async previewRoleChange(
    input: Parameters<WorkspaceMembersRepository['previewRoleChange']>[0],
  ): Promise<
    Awaited<ReturnType<WorkspaceMembersRepository['previewRoleChange']>>
  > {
    this.previewRoleChangeInput = input;
    if (!this.previewRoleChangeResult) {
      throw new Error(
        'FakeWorkspaceMembersRepository.previewRoleChangeResult not set',
      );
    }
    return this.previewRoleChangeResult;
  }

  async changeRole(
    input: Parameters<WorkspaceMembersRepository['changeRole']>[0],
  ): Promise<Awaited<ReturnType<WorkspaceMembersRepository['changeRole']>>> {
    this.changeRoleInput = input;
    return (
      this.changeRoleResult ?? {
        status: 'success',
        member: {
          userId: input.targetUserId,
          firstName: 'Target',
          lastName: 'User',
          displayName: 'Target User',
          email: 'target@example.com',
          avatarUrl: null,
          role: input.toRole,
          accountActive: true,
          joinedAt: new Date(),
        },
        fromRole: input.fromRole,
        toRole: input.toRole,
        effect: 'apply_project_role',
        appliedProjectCount: 0,
      }
    );
  }
}
