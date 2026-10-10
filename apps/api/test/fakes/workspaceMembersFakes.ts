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
}

