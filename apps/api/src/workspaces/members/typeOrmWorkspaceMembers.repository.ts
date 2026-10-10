import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { WorkspaceRole } from '@repo/contracts';
import {
  WorkspaceMembersRepository,
  type MemberCandidateRow,
  type AddMembersResult,
} from './workspaceMembers.repository.js';
import type { WorkspaceMemberRow } from './dto/workspaceMemberResponse.dto.js';

interface RawMemberRow {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  role: WorkspaceRole;
  joinedAt: Date | string;
  accountActive: boolean;
  total: string | number;
}

@Injectable()
export class TypeOrmWorkspaceMembersRepository extends WorkspaceMembersRepository {
  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async list(
    workspaceId: string,
    opts: {
      includeEmail: boolean;
      roleOrder: readonly WorkspaceRole[];
      limit: number;
    },
  ): Promise<{ members: WorkspaceMemberRow[]; total: number }> {
    const rawRows = await this.dataSource.query<RawMemberRow[]>(
      `SELECT m.member_id AS "userId",
              u.first_name AS "firstName",
              u.last_name AS "lastName",
              u.display_name AS "displayName",
              CASE WHEN $2 THEN u.email END AS email,
              u.avatar AS "avatarUrl",
              m.role,
              m.joined_at AS "joinedAt",
              u.is_active AS "accountActive",
              count(*) OVER () AS total
       FROM workspace_members m
       JOIN users u ON u.id = m.member_id
       WHERE m.workspace_id = $1 AND m.is_active
       ORDER BY array_position($3::varchar[], m.role),
                lower(COALESCE(NULLIF(btrim(u.first_name || ' ' || u.last_name), ''), u.display_name)),
                m.member_id
       LIMIT $4`,
      [workspaceId, opts.includeEmail, opts.roleOrder, opts.limit],
    );

    const total = rawRows.length > 0 ? Number(rawRows[0]!.total) : 0;
    const members: WorkspaceMemberRow[] = rawRows.map((r) => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      email: r.email,
      avatarUrl: r.avatarUrl,
      role: r.role,
      joinedAt: new Date(r.joinedAt),
      accountActive: r.accountActive,
    }));

    return { members, total };
  }

  async searchCandidates(
    _workspaceId: string,
    _query: string,
    _limit: number,
  ): Promise<MemberCandidateRow[]> {
    throw new Error('searchCandidates not implemented yet');
  }

  async addMembers(_input: {
    workspaceId: string;
    actorId: string;
    requestId: string;
    now: Date;
    members: readonly { userId: string; role: WorkspaceRole }[];
    canAdd: (actor: {
      role: WorkspaceRole;
      permissions: readonly string[];
    }) => boolean;
  }): Promise<AddMembersResult> {
    throw new Error('addMembers not implemented yet');
  }
}

