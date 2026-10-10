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
    _query: string,
    _limit: number,
  ): Promise<MemberCandidateRow[]> {
    return [];
  }

  async addMembers(_input: unknown): Promise<AddMembersResult> {
    return { status: 'added', members: [], reactivatedCount: 0 };
  }
}

