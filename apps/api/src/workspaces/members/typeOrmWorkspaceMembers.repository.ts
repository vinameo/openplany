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
  assignableWorkspaceRoles,
  planWorkspaceRoleChange,
  resolveAppliedProjectRole,
  isProjectAdminRole,
  isWorkspaceAdminRole,
  ROLE_CHANGE_PREVIEW_PROJECTS_MAX,
  WORKSPACE_ROLE_CHANGE_MESSAGES,
  MEMBER_MESSAGES,
  type MemberNotAddableReason,
  type WorkspacePermission,
  type WorkspaceRole,
  type BoundedProjectList,
  type WorkspaceRoleChangePreview,
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
import { ProjectAccessPolicyStore } from '../../roles/projectAccessPolicyStore.js';
import { Project } from '../../projects/entities/project.entity.js';
import { ProjectMember } from '../../projects/entities/projectMember.entity.js';
import {
  ACTIVE_PROJECT,
  assignedProjectAdmins,
} from '../../projects/projectFilters.js';
import {
  ProjectAccessResolver,
  type ProjectViewer,
} from '../../projects/access/projectAccessResolver.js';
import { recordProjectRoleChanges } from '../../projects/repositories/projectRoleHistory.js';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspaceMember } from '../entities/workspaceMember.entity.js';
import { recordWorkspaceRoleChanges } from '../repositories/workspaceRoleHistory.js';
import { assertWorkspaceKeepsAdmin, LastAdminError } from '../workspaceAdminGuard.js';
import {
  WorkspaceMembersRepository,
  type MemberCandidateRow,
  type AddMembersResult,
  type ChangeRoleInput,
  type ChangeRoleResult,
  type PreviewRoleChangeInput,
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

  constructor(
    private readonly dataSource: DataSource,
    private readonly accessResolver: ProjectAccessResolver,
    private readonly policyStore: ProjectAccessPolicyStore,
  ) {
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
      // Every other reference is locked before the write, so only a role the
      // `roles` table no longer holds can break a foreign key here.
      if (isForeignKeyViolation(err)) {
        this.logger.warn(
          `workspace.members.add.role_unknown workspaceId=${input.workspaceId} requestId=${input.requestId}`,
        );
        return { status: 'role_unknown' };
      }
      throw err;
    }
  }

  async previewRoleChange(
    input: PreviewRoleChangeInput,
  ): Promise<WorkspaceRoleChangePreview> {
    const { workspaceId, actor, targetUserId, targetRole } = input;
    const manager = this.dataSource.manager;

    const target = await manager.findOne(WorkspaceMember, {
      where: { workspaceId, memberId: targetUserId, isActive: true },
    });
    if (!target) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        WORKSPACE_ROLE_CHANGE_MESSAGES.memberGone,
      );
    }

    if (actor.userId === targetUserId) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.roleNotAllowed,
      );
    }

    const assignable = assignableWorkspaceRoles(actor, {
      userId: targetUserId,
      role: target.role,
    });
    if (!assignable.includes(targetRole)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.roleNotAllowed,
      );
    }

    if (targetRole === target.role) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'ROLE_UNCHANGED',
        MEMBER_MESSAGES.sameRole,
      );
    }

    const { live } = await liveProjectRowsOf(
      manager,
      workspaceId,
      targetUserId,
      { lock: false },
    );
    const policies = this.policyStore.policies();
    const plan = planWorkspaceRoleChange(
      {
        actor: { workspaceRole: actor.role },
        fromRole: target.role,
        toRole: targetRole,
        liveProjectCount: live.length,
      },
      policies,
    );

    let affectedProjectIds: string[] = [];
    if (plan.effect === 'gain_implicit') {
      affectedProjectIds = live.map((pm) => pm.projectId);
    } else if (plan.effect === 'lose_implicit') {
      const liveProjects = await manager.find(Project, {
        where: { workspaceId, ...ACTIVE_PROJECT },
        select: { id: true },
      });
      affectedProjectIds = liveProjects.map((p) => p.id);
    } else if (plan.effect === 'apply_project_role') {
      affectedProjectIds = live.map((pm) => pm.projectId);
    } else {
      affectedProjectIds = [];
    }

    let losingAdminProjectIds: string[] = [];
    const targetAssignedAdminLiveProjects = live.filter((pm) =>
      isProjectAdminRole(pm.role),
    );
    if (targetAssignedAdminLiveProjects.length > 0) {
      const candidateIds = targetAssignedAdminLiveProjects.map(
        (pm) => pm.projectId,
      );
      const adminCounts = await assignedProjectAdmins(manager, candidateIds);
      losingAdminProjectIds = candidateIds.filter(
        (pid) => adminCounts.get(pid) === 1,
      );
    }

    const viewer: ProjectViewer = {
      workspaceId,
      userId: actor.userId,
      workspaceRole: actor.role,
    };

    const affectedProjects = await buildBoundedProjectList(
      manager,
      this.accessResolver,
      viewer,
      affectedProjectIds,
    );

    const projectsLosingAssignedAdmin = await buildBoundedProjectList(
      manager,
      this.accessResolver,
      viewer,
      losingAdminProjectIds,
    );

    return {
      userId: targetUserId,
      fromRole: target.role,
      toRole: targetRole,
      effect: plan.effect,
      affectedProjects,
      projectsLosingAssignedAdmin,
      projectRoleChoices: plan.projectRoleChoices,
      defaultProjectRole: plan.defaultProjectRole,
      actorCanChooseProjectRole: plan.actorCanChooseProjectRole,
    };
  }

  async changeRole(input: ChangeRoleInput): Promise<ChangeRoleResult> {
    const {
      workspaceId,
      actorId,
      targetUserId,
      fromRole,
      toRole,
      projectRole,
      requestId,
      now,
    } = input;

    return await runTransactionWithRetry(
      this.dataSource,
      async (manager) => {
        // 1. Lock workspace
        const ws = await manager.findOne(Workspace, {
          where: { id: workspaceId },
          lock: { mode: 'for_no_key_update' },
        });
        if (!ws) {
          return { status: 'member_gone' };
        }

        // 2. Lock members in deterministic order
        const memberIds = [actorId, targetUserId].sort(compareIds);
        const members = await manager.find(WorkspaceMember, {
          where: { workspaceId, memberId: In(memberIds) },
          order: { memberId: 'ASC' },
          lock: { mode: 'for_no_key_update' },
        });

        // 3. Lock live project rows of target
        const { all, live } = await liveProjectRowsOf(
          manager,
          workspaceId,
          targetUserId,
          { lock: true },
        );

        // INV-11 checks:
        // 1. Target active
        const target = members.find(
          (m) => m.memberId === targetUserId && m.isActive,
        );
        if (!target) {
          return { status: 'member_gone' };
        }

        // 2. Actor active
        const actor = members.find((m) => m.memberId === actorId && m.isActive);
        if (!actor) {
          return { status: 'actor_forbidden' };
        }

        // 3. Self-change forbidden
        if (actorId === targetUserId) {
          return { status: 'actor_forbidden' };
        }

        // 4. Actor permissions & rank
        const granted = await loadRolePermissions(manager, [
          { scope: 'workspace', key: actor.role },
        ]);
        const actorPermissions = parseWorkspacePermissions(
          granted.get(rolePermissionsKey('workspace', actor.role)) ?? [],
        );
        const assignable = assignableWorkspaceRoles(
          { userId: actorId, role: actor.role, permissions: actorPermissions },
          { userId: targetUserId, role: target.role },
        );
        if (!assignable.includes(toRole)) {
          return { status: 'actor_forbidden' };
        }

        // 5. fromRole matches target.role
        if (fromRole !== target.role) {
          return { status: 'role_changed' };
        }

        // 6. role is not the same role
        if (toRole === target.role) {
          return { status: 'same_role' };
        }

        // 7. Plan and resolve project role
        const policies = this.policyStore.policies();
        const plan = planWorkspaceRoleChange(
          {
            actor: { workspaceRole: actor.role },
            fromRole: target.role,
            toRole,
            liveProjectCount: live.length,
          },
          policies,
        );
        const applied = resolveAppliedProjectRole(
          plan,
          policies[toRole],
          projectRole,
        );
        if (!applied.ok) {
          if (applied.reason === 'actor_cannot_choose') {
            return { status: 'actor_cannot_choose' };
          }
          return { status: 'project_role_out_of_range' };
        }

        // 8. Last admin check
        if (isWorkspaceAdminRole(target.role) && !isWorkspaceAdminRole(toRole)) {
          try {
            await assertWorkspaceKeepsAdmin(manager, workspaceId, {
              excludeMemberId: targetUserId,
            });
          } catch (err) {
            if (err instanceof LastAdminError) {
              return { status: 'last_admin' };
            }
            throw err;
          }
        }

        // Writes:
        // Step 1: Update workspace member role
        await manager.update(
          WorkspaceMember,
          { workspaceId, memberId: targetUserId },
          { role: toRole, updatedAt: now },
        );

        // Step 2 & 3: Update project members
        let liveChangedCount = 0;
        const liveSet = new Set(live.map((p) => p.id));

        if (applied.role === null) {
          if (all.length > 0) {
            await manager.update(
              ProjectMember,
              { id: In(all.map((p) => p.id)) },
              { isActive: false, updatedAt: now },
            );
          }
          const liveChanged = all.filter((p) => liveSet.has(p.id));
          liveChangedCount = liveChanged.length;

          if (liveChanged.length > 0) {
            await recordProjectRoleChanges(
              manager,
              liveChanged.map((p) => ({
                workspaceId,
                projectId: p.projectId,
                memberId: targetUserId,
                fromRole: p.role,
                toRole: null,
                changeType: 'workspace_role_applied' as const,
                actorId,
                requestId,
                createdAt: now,
              })),
            );
          }
        } else {
          const toUpdate = all.filter((p) => p.role !== applied.role);
          if (toUpdate.length > 0) {
            await manager.update(
              ProjectMember,
              { id: In(toUpdate.map((p) => p.id)) },
              { role: applied.role, updatedAt: now },
            );
          }
          const liveChanged = toUpdate.filter((p) => liveSet.has(p.id));
          liveChangedCount = liveChanged.length;

          if (liveChanged.length > 0) {
            await recordProjectRoleChanges(
              manager,
              liveChanged.map((p) => ({
                workspaceId,
                projectId: p.projectId,
                memberId: targetUserId,
                fromRole: p.role,
                toRole: applied.role,
                changeType: 'workspace_role_applied' as const,
                actorId,
                requestId,
                createdAt: now,
              })),
            );
          }
        }

        // Step 4: Workspace role change history
        await recordWorkspaceRoleChanges(manager, [
          {
            workspaceId,
            memberId: targetUserId,
            fromRole: target.role,
            toRole,
            changeType: 'role_changed',
            actorId,
            requestId,
            at: now,
          },
        ]);

        // Step 6: Read back target member
        const rawRow = await activeMembers(manager, workspaceId)
          .andWhere('m.memberId = :targetUserId', { targetUserId })
          .getRawOne<RawMemberRow>();
        if (!rawRow) {
          return { status: 'member_gone' };
        }

        return {
          status: 'success',
          member: toMemberRow(rawRow),
          fromRole: target.role,
          toRole,
          effect: plan.effect,
          appliedProjectCount: liveChangedCount,
        };
      },
      {
        maxAttempts: 3,
        onRetry: (attempt) => {
          this.logger.warn(
            `workspace.members.change_role.retry workspaceId=${workspaceId} targetId=${targetUserId} attempt=${attempt} requestId=${requestId}`,
          );
        },
      },
    );
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

export async function liveProjectRowsOf(
  manager: EntityManager,
  workspaceId: string,
  memberId: string,
  opts: { lock: boolean },
): Promise<{ all: ProjectMember[]; live: ProjectMember[] }> {
  const findOptions: {
    where: { workspaceId: string; memberId: string; isActive: boolean };
    order: { projectId: 'ASC' };
    lock?: { mode: 'pessimistic_write' };
  } = {
    where: {
      workspaceId,
      memberId,
      isActive: true,
    },
    order: {
      projectId: 'ASC',
    },
  };

  if (opts.lock) {
    findOptions.lock = { mode: 'pessimistic_write' };
  }

  const all = await manager.find(ProjectMember, findOptions);
  if (all.length === 0) {
    return { all: [], live: [] };
  }

  const projectIds = all.map((pm) => pm.projectId);
  const activeProjects = await manager.find(Project, {
    where: {
      id: In(projectIds),
      ...ACTIVE_PROJECT,
    },
    select: { id: true },
  });

  const activeProjectIds = new Set(activeProjects.map((p) => p.id));
  const live = all.filter((pm) => activeProjectIds.has(pm.projectId));

  return { all, live };
}

export async function buildBoundedProjectList(
  manager: EntityManager,
  resolver: ProjectAccessResolver,
  viewer: ProjectViewer,
  projectIds: readonly string[],
): Promise<BoundedProjectList> {
  const total = projectIds.length;
  if (total === 0) {
    return { projects: [], total: 0, hiddenCount: 0 };
  }

  const accessibleSet = await resolver.filterAccessible(viewer, projectIds);
  const accessibleIds = projectIds.filter((id) => accessibleSet.has(id));
  const hiddenCount = total - accessibleIds.length;

  if (accessibleIds.length === 0) {
    return { projects: [], total, hiddenCount };
  }

  const accessibleProjects = await manager.find(Project, {
    where: { id: In(accessibleIds) },
    select: { id: true, name: true, identifier: true },
    order: { name: 'ASC', identifier: 'ASC' },
    take: ROLE_CHANGE_PREVIEW_PROJECTS_MAX,
  });

  return {
    projects: accessibleProjects.map((p) => ({
      id: p.id,
      name: p.name,
      identifier: p.identifier,
    })),
    total,
    hiddenCount,
  };
}
