import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  In,
  IsNull,
  type EntityManager,
} from 'typeorm';
import {
  escapeLikePattern,
  parseWorkspacePermissions,
  type MemberNotAddableReason,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@repo/contracts';
import { User } from '../../auth/entities/user.entity.js';
import { ADDABLE_USER } from '../../auth/addableUser.js';
import { ApiException } from '../../common/apiException.js';
import { isForeignKeyViolation } from '../../common/databaseErrors.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspaceMember } from '../entities/workspaceMember.entity.js';
import { recordWorkspaceRoleChanges } from '../repositories/workspaceRoleHistory.js';
import {
  WorkspaceMembersRepository,
  type MemberCandidateRow,
  type AddMembersResult,
} from './workspaceMembers.repository.js';
import type { WorkspaceMemberRow } from './dto/workspaceMemberResponse.dto.js';

/** A concurrent add of the same person surfaces as this unique violation; a retry then reports it as already_member. */
const WORKSPACE_MEMBER_UNIQUE = 'workspace_members_workspace_member_key';
const MAX_ADD_ATTEMPTS = 3;

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
}

type RawCandidateRow = Omit<MemberCandidateRow, 'alreadyMember'> & {
  alreadyMember: boolean | string | number;
};

interface AddMembersInput {
  workspaceId: string;
  actorId: string;
  requestId: string;
  now: Date;
  members: readonly { userId: string; role: WorkspaceRole }[];
  canAdd: (actor: {
    role: WorkspaceRole;
    permissions: readonly WorkspacePermission[];
  }) => boolean;
}

@Injectable()
export class TypeOrmWorkspaceMembersRepository extends WorkspaceMembersRepository {
  private readonly logger = new Logger(TypeOrmWorkspaceMembersRepository.name);

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
    const rows = await activeMembers(this.dataSource.manager, workspaceId)
      .addSelect('count(*) OVER ()', 'total')
      .orderBy('array_position(CAST(:roleOrder AS varchar[]), m.role)')
      .addOrderBy(
        `lower(COALESCE(NULLIF(btrim(u.firstName || ' ' || u.lastName), ''), u.displayName))`,
      )
      .addOrderBy('m.memberId')
      .setParameter('roleOrder', opts.roleOrder)
      .limit(opts.limit)
      .getRawMany<RawMemberRow & { total: string | number }>();

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
    const members = rows.map((row) => ({
      ...toMemberRow(row),
      email: opts.includeEmail ? row.email : null,
    }));
    return { members, total };
  }

  async searchCandidates(
    workspaceId: string,
    query: string,
    limit: number,
  ): Promise<MemberCandidateRow[]> {
    const escaped = escapeLikePattern(query);
    const qb = this.dataSource.manager.createQueryBuilder(User, 'u');
    // EXISTS, not a LEFT JOIN, so a person never appears twice (DB-27).
    const membership = qb
      .subQuery()
      .select('1')
      .from(WorkspaceMember, 'm')
      .where('m.workspaceId = :workspaceId')
      .andWhere('m.memberId = u.id')
      .andWhere('m.isActive = true')
      .getQuery();

    const rows = await qb
      .select('u.id', 'userId')
      .addSelect('u.email', 'email')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.avatar', 'avatarUrl')
      .addSelect(`EXISTS ${membership}`, 'alreadyMember')
      .where(ADDABLE_USER)
      .andWhere(`lower(u.email) LIKE :patternAny ESCAPE '\\'`)
      .orderBy('(lower(u.email) = :query)', 'DESC')
      .addOrderBy(`(lower(u.email) LIKE :patternPrefix ESCAPE '\\')`, 'DESC')
      .addOrderBy('lower(u.email)', 'ASC')
      .setParameters({
        workspaceId,
        query,
        patternAny: `%${escaped}%`,
        patternPrefix: `${escaped}%`,
      })
      .limit(limit)
      .getRawMany<RawCandidateRow>();

    return rows.map((r) => ({
      userId: r.userId,
      email: r.email,
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      alreadyMember: Boolean(r.alreadyMember),
    }));
  }

  async addMembers(input: AddMembersInput): Promise<AddMembersResult> {
    try {
      return await runTransactionWithRetry(
        this.dataSource,
        (manager) => addMembersOnce(manager, input),
        {
          maxAttempts: MAX_ADD_ATTEMPTS,
          retryOnUnique: WORKSPACE_MEMBER_UNIQUE,
          onRetry: (attempt) => {
            this.logger.warn(
              `workspace.members.add.retry workspaceId=${input.workspaceId} attempt=${attempt} requestId=${input.requestId}`,
            );
          },
        },
      );
    } catch (err: unknown) {
      if (isForeignKeyViolation(err)) {
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

/**
 * One attempt, inside one transaction. Returning early before any write
 * simply commits an empty transaction, so no manual rollback is needed.
 */
async function addMembersOnce(
  manager: EntityManager,
  input: AddMembersInput,
): Promise<AddMembersResult> {
  const { workspaceId, actorId, now } = input;

  // 1. FOR SHARE: the workspace cannot be soft-deleted until commit.
  const workspace = await manager.findOne(Workspace, {
    select: { id: true },
    where: { id: workspaceId, deletedAt: IsNull() },
    lock: { mode: 'pessimistic_read' },
  });
  if (workspace === null) return { status: 'workspace_gone' };

  // 2. Re-check the actor against their locked membership and current grants.
  const actor = await manager.findOne(WorkspaceMember, {
    select: { id: true, role: true, roleScope: true },
    where: { workspaceId, memberId: actorId, isActive: true },
    lock: { mode: 'pessimistic_read' },
  });
  if (actor === null) return { status: 'actor_forbidden' };

  const granted = await loadRolePermissions(manager, [
    { scope: actor.roleScope, key: actor.role },
  ]);
  const permissions = parseWorkspacePermissions(
    granted.get(rolePermissionsKey(actor.roleScope, actor.role)) ?? [],
  );
  if (!input.canAdd({ role: actor.role, permissions })) {
    return { status: 'actor_forbidden' };
  }

  // 3. Lock target users and their existing memberships in id order, so two
  //    concurrent batches with overlapping people wait instead of deadlocking.
  const targetIds = input.members.map((m) => m.userId);
  const addableUsers = await manager.find(User, {
    select: { id: true },
    where: { ...ADDABLE_USER, id: In(targetIds) },
    order: { id: 'ASC' },
    lock: { mode: 'pessimistic_read' },
  });
  const addableIds = new Set(addableUsers.map((u) => u.id));

  const existing =
    addableIds.size === 0
      ? []
      : await manager.find(WorkspaceMember, {
          select: { id: true, memberId: true, isActive: true },
          where: { workspaceId, memberId: In([...addableIds]) },
          order: { memberId: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        });
  const existingByMember = new Map(existing.map((row) => [row.memberId, row]));

  // 4. All-or-nothing: any row that cannot be added rejects the batch.
  const rejected: { index: number; reason: MemberNotAddableReason }[] = [];
  input.members.forEach((m, index) => {
    if (!addableIds.has(m.userId)) {
      rejected.push({ index, reason: 'unavailable' });
    } else if (existingByMember.get(m.userId)?.isActive === true) {
      rejected.push({ index, reason: 'already_member' });
    }
  });
  if (rejected.length > 0) return { status: 'rejected', rows: rejected };

  // 5. New people get a row; previously removed ones are reactivated.
  //    Writes go in member id order, matching the lock order above.
  const ordered = [...input.members].sort((a, b) =>
    compareIds(a.userId, b.userId),
  );
  const toInsert = ordered.filter((m) => !existingByMember.has(m.userId));
  if (toInsert.length > 0) {
    await manager.insert(
      WorkspaceMember,
      toInsert.map((m) => ({
        workspaceId,
        memberId: m.userId,
        roleScope: 'workspace' as const,
        role: m.role,
        isActive: true,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const reactivated = ordered.filter((m) => existingByMember.has(m.userId));
  for (const [role, memberIds] of groupByRole(reactivated)) {
    await manager.update(
      WorkspaceMember,
      {
        id: In(memberIds.map((memberId) => existingByMember.get(memberId)!.id)),
      },
      { role, isActive: true, joinedAt: now, updatedAt: now },
    );
  }

  // 6. Role history, same transaction and timestamp.
  await recordWorkspaceRoleChanges(
    manager,
    input.members.map((m) => ({
      workspaceId,
      memberId: m.userId,
      fromRole: null,
      toRole: m.role,
      changeType: 'member_added',
      actorId,
      requestId: input.requestId,
      at: now,
    })),
  );

  // 7. Read the added members back in request order.
  const rows = await activeMembers(manager, workspaceId)
    .andWhere({ memberId: In(targetIds) })
    .getRawMany<RawMemberRow>();
  const byUserId = new Map(rows.map((row) => [row.userId, toMemberRow(row)]));

  return {
    status: 'added',
    members: input.members.map((m) => byUserId.get(m.userId)!),
    reactivatedCount: reactivated.length,
  };
}

/** Active members of one workspace joined to their user, projected by entity property. */
function activeMembers(manager: EntityManager, workspaceId: string) {
  return manager
    .createQueryBuilder(WorkspaceMember, 'm')
    .innerJoin(User, 'u', 'u.id = m.memberId')
    .select('m.memberId', 'userId')
    .addSelect('u.firstName', 'firstName')
    .addSelect('u.lastName', 'lastName')
    .addSelect('u.displayName', 'displayName')
    .addSelect('u.email', 'email')
    .addSelect('u.avatar', 'avatarUrl')
    .addSelect('m.role', 'role')
    .addSelect('m.joinedAt', 'joinedAt')
    .addSelect('u.isActive', 'accountActive')
    .where({ workspaceId, isActive: true });
}

function toMemberRow(row: RawMemberRow): WorkspaceMemberRow {
  return {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    email: row.email,
    avatarUrl: row.avatarUrl,
    role: row.role,
    joinedAt: new Date(row.joinedAt),
    accountActive: row.accountActive,
  };
}

function groupByRole(
  members: readonly { userId: string; role: WorkspaceRole }[],
): Map<WorkspaceRole, string[]> {
  const groups = new Map<WorkspaceRole, string[]>();
  for (const m of members) {
    const ids = groups.get(m.role);
    if (ids === undefined) groups.set(m.role, [m.userId]);
    else ids.push(m.userId);
  }
  return groups;
}

/** Same order as Postgres uses for uuid values. */
function compareIds(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}
