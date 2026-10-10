import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  escapeLikePattern,
  parseWorkspacePermissions,
  type MemberNotAddableReason,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@repo/contracts';
import { ApiException } from '../../common/apiException.js';
import { recordWorkspaceRoleChanges } from '../repositories/workspaceRoleHistory.js';
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
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<MemberCandidateRow[]> {
    const escaped = escapeLikePattern(query);
    const patternAny = `%${escaped}%`;
    const patternPrefix = `${escaped}%`;

    const rawRows = await this.dataSource.query<
      (Omit<MemberCandidateRow, 'alreadyMember'> & {
        alreadyMember: boolean | string | number;
      })[]
    >(
      `SELECT u.id                AS "userId",
              u.email,
              u.first_name        AS "firstName",
              u.last_name         AS "lastName",
              u.display_name      AS "displayName",
              u.avatar            AS "avatarUrl",
              EXISTS (SELECT 1 FROM workspace_members m
                      WHERE m.workspace_id = $2 AND m.member_id = u.id AND m.is_active) AS "alreadyMember"
       FROM users u
       WHERE u.is_active AND NOT u.is_bot AND u.masked_at IS NULL AND u.email IS NOT NULL
         AND lower(u.email) LIKE $1 ESCAPE '\\'
       ORDER BY (lower(u.email) = $3) DESC,
                (lower(u.email) LIKE $4 ESCAPE '\\') DESC,
                lower(u.email)
       LIMIT $5`,
      [patternAny, workspaceId, query, patternPrefix, limit],
    );

    return rawRows.map((r) => ({
      userId: r.userId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      alreadyMember: Boolean(r.alreadyMember),
    }));
  }

  async addMembers(input: {
    workspaceId: string;
    actorId: string;
    requestId: string;
    now: Date;
    members: readonly { userId: string; role: WorkspaceRole }[];
    canAdd: (actor: {
      role: WorkspaceRole;
      permissions: readonly WorkspacePermission[];
    }) => boolean;
  }): Promise<AddMembersResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Step 1: Lock workspace (FOR SHARE)
      const wsRows = (await queryRunner.query(
        `SELECT id FROM workspaces WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
        [input.workspaceId],
      )) as { id: string }[];
      if (wsRows.length === 0) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return { status: 'workspace_gone' };
      }

      // Step 2: Lock and check actor (FOR SHARE OF m)
      const actorRows = (await queryRunner.query(
        `SELECT m.role,
                COALESCE((SELECT array_agg(rp.permission_key)
                          FROM role_permissions rp
                          WHERE rp.scope = m.role_scope AND rp.role_key = m.role), '{}') AS permissions
         FROM workspace_members m
         WHERE m.workspace_id = $1 AND m.member_id = $2 AND m.is_active
         FOR SHARE OF m`,
        [input.workspaceId, input.actorId],
      )) as { role: WorkspaceRole; permissions: string[] | string }[];

      if (actorRows.length === 0) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return { status: 'actor_forbidden' };
      }

      const rawPermissions = actorRows[0]!.permissions;
      const permArray = Array.isArray(rawPermissions)
        ? rawPermissions
        : typeof rawPermissions === 'string'
          ? rawPermissions.replace(/^\{|\}$/g, '').split(',').filter(Boolean)
          : [];
      const actorPermissions = parseWorkspacePermissions(permArray);

      if (
        !input.canAdd({
          role: actorRows[0]!.role,
          permissions: actorPermissions,
        })
      ) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return { status: 'actor_forbidden' };
      }

      // Step 3: Lock target users (FOR SHARE)
      const targetUserIds = input.members.map((m) => m.userId);
      const validUsers = (await queryRunner.query(
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[])
           AND is_active AND NOT is_bot AND masked_at IS NULL AND email IS NOT NULL
         FOR SHARE`,
        [targetUserIds],
      )) as { id: string }[];
      const validUserIds = new Set(validUsers.map((u) => u.id));

      // Step 4: Batch insert / update
      const validMembers = input.members.filter((m) =>
        validUserIds.has(m.userId),
      );
      let insertedRows: { member_id: string; reactivated: boolean }[] = [];

      if (validMembers.length > 0) {
        insertedRows = (await queryRunner.query(
          `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, joined_at, created_at, updated_at)
           SELECT $1, t.member_id, t.role, true, $4, $4, $4
           FROM unnest($2::uuid[], $3::varchar[]) AS t(member_id, role)
           ON CONFLICT (workspace_id, member_id) DO UPDATE
              SET role       = EXCLUDED.role,
                  is_active  = true,
                  joined_at  = EXCLUDED.joined_at,
                  updated_at = EXCLUDED.updated_at
            WHERE workspace_members.is_active = false
           RETURNING member_id, (xmax <> 0) AS reactivated`,
          [
            input.workspaceId,
            validMembers.map((m) => m.userId),
            validMembers.map((m) => m.role),
            input.now,
          ],
        )) as { member_id: string; reactivated: boolean }[];
      }

      const insertedUserIds = new Set(insertedRows.map((r) => r.member_id));

      // Step 5: Check rejection
      const rejectedRows: { index: number; reason: MemberNotAddableReason }[] =
        [];
      input.members.forEach((m, index) => {
        if (!validUserIds.has(m.userId)) {
          rejectedRows.push({ index, reason: 'unavailable' });
        } else if (!insertedUserIds.has(m.userId)) {
          rejectedRows.push({ index, reason: 'already_member' });
        }
      });

      if (rejectedRows.length > 0) {
        await queryRunner.rollbackTransaction();
        await queryRunner.release();
        return { status: 'rejected', rows: rejectedRows };
      }

      // Step 6: Record history
      await recordWorkspaceRoleChanges(
        queryRunner.manager,
        input.members.map((m) => ({
          workspaceId: input.workspaceId,
          memberId: m.userId,
          fromRole: null,
          toRole: m.role,
          changeType: 'member_added',
          actorId: input.actorId,
          requestId: input.requestId,
          at: input.now,
        })),
      );

      // Step 7: Read back added members
      const readBackRows = (await queryRunner.query(
        `SELECT m.member_id AS "userId",
                u.first_name AS "firstName",
                u.last_name AS "lastName",
                u.display_name AS "displayName",
                u.email,
                u.avatar AS "avatarUrl",
                m.role,
                m.joined_at AS "joinedAt",
                u.is_active AS "accountActive"
         FROM workspace_members m
         JOIN users u ON u.id = m.member_id
         WHERE m.workspace_id = $1 AND m.member_id = ANY($2::uuid[]) AND m.is_active`,
        [input.workspaceId, targetUserIds],
      )) as Omit<RawMemberRow, 'total'>[];

      const readBackMap = new Map<string, WorkspaceMemberRow>(
        readBackRows.map((r) => [
          r.userId,
          {
            userId: r.userId,
            firstName: r.firstName,
            lastName: r.lastName,
            displayName: r.displayName,
            email: r.email,
            avatarUrl: r.avatarUrl,
            role: r.role,
            joinedAt: new Date(r.joinedAt),
            accountActive: r.accountActive,
          },
        ]),
      );

      const members = input.members.map((m) => readBackMap.get(m.userId)!);
      const reactivatedCount = insertedRows.filter((r) =>
        Boolean(r.reactivated),
      ).length;

      await queryRunner.commitTransaction();
      await queryRunner.release();
      return { status: 'added', members, reactivatedCount };
    } catch (err: unknown) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      await queryRunner.release();

      if ((err as { code?: string })?.code === '23503') {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Check the highlighted fields',
          { fields: { members: 'Invalid role' } },
        );
      }
      throw err;
    }
  }
}

