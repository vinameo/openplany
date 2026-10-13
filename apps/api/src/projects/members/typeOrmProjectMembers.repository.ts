import { Injectable, Logger } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  In,
  type SelectQueryBuilder,
} from 'typeorm';
import {
  escapeLikePattern,
  parseWorkspacePermissions,
  type ProjectMemberNotAddableReason,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';
import { User } from '../../auth/entities/user.entity.js';
import { ADDABLE_USER } from '../../auth/addableUser.js';
import { isForeignKeyViolation } from '../../common/databaseErrors.js';
import { equalsLowercase } from '../../database/findOperators.js';
import { runTransactionWithRetry } from '../../database/transactionRetry.js';
import { loadRolePermissions, rolePermissionsKey } from '../../roles/rolePermissionsQuery.js';
import { WorkspaceMember } from '../../workspaces/entities/workspaceMember.entity.js';
import { ProjectAccessResolver } from '../access/projectAccessResolver.js';
import { Project } from '../entities/project.entity.js';
import { ProjectMember } from '../entities/projectMember.entity.js';
import { ProjectMemberRoleHistory } from '../entities/projectMemberRoleHistory.entity.js';
import {
  ACTIVE_PROJECT,
  assignedProjectAdmins,
  inheritedProjectMembersQuery,
  projectMembersQuery,
} from '../projectFilters.js';
import type {
  AddProjectMembersActorContext,
  AddProjectMembersInput,
  AddProjectMembersResult,
  ListInheritedProjectMembersOpts,
  ListProjectMembersOpts,
  ProjectMemberCandidateDbRow,
  ProjectMembersRepository,
  SearchProjectMemberCandidatesInput,
} from './projectMembers.repository.js';
import type {
  InheritedMemberDbRow,
  ProjectMemberDbRow,
} from './dto/projectMemberResponse.js';
import { toProjectActor } from './projectMemberActor.js';

interface RawCandidateRow {
  userId: string;
  firstName: string;
  lastName: string;
  displayName: string;
  avatarUrl: string | null;
  email?: string;
  workspaceRole: WorkspaceRole;
  alreadyMember: boolean | number | string;
}

const MAX_ADD_ATTEMPTS = 3;
const PROJECT_MEMBER_UNIQUE = 'project_members_project_member_key';

@Injectable()
export class TypeOrmProjectMembersRepository implements ProjectMembersRepository {
  private readonly logger = new Logger(TypeOrmProjectMembersRepository.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly accessResolver: ProjectAccessResolver,
  ) {}

  async list(
    projectId: string,
    opts: ListProjectMembersOpts,
  ): Promise<{ members: ProjectMemberDbRow[]; total: number }> {
    const rows = await selectProjectMemberColumns(
      projectMembersQuery(
        this.dataSource.manager,
        { projectId },
        opts.implicitRoles,
      ),
      opts.includeEmail,
    )
      .addSelect('count(*) OVER ()', 'total')
      .orderBy('array_position(CAST(:roleOrder AS varchar[]), pm.role)')
      .addOrderBy(
        `lower(COALESCE(NULLIF(btrim(u.firstName || ' ' || u.lastName), ''), u.displayName))`,
      )
      .addOrderBy('pm.memberId')
      .setParameter('roleOrder', opts.roleOrder)
      .limit(opts.limit)
      .getRawMany<ProjectMemberDbRow & { total: string | number }>();

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0;
    const members = rows.map((row) => toMemberDbRow(row, opts.includeEmail));

    return { members, total };
  }

  async listInherited(
    workspaceId: string,
    opts: ListInheritedProjectMembersOpts,
  ): Promise<{ members: InheritedMemberDbRow[]; total: number }> {
    if (opts.implicitRoles.length === 0) {
      return { members: [], total: 0 };
    }
    const qb = inheritedProjectMembersQuery(
      this.dataSource.manager,
      workspaceId,
      opts.implicitRoles,
    );

    const total = await qb.clone().getCount();

    qb.select('wm.memberId', 'userId')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.avatar', 'avatarUrl')
      .addSelect('wm.role', 'workspaceRole')
      .addSelect('u.isActive', 'accountActive')
      .orderBy(
        `lower(COALESCE(NULLIF(btrim(u.firstName || ' ' || u.lastName), ''), u.displayName))`,
      )
      .addOrderBy('wm.memberId')
      .limit(opts.limit);

    if (opts.includeEmail) {
      qb.addSelect('u.email', 'email');
    }

    const rows = await qb.getRawMany<
      InheritedMemberDbRow & { total: string | number }
    >();
    const members: InheritedMemberDbRow[] = rows.map((row) => ({
      userId: row.userId,
      firstName: row.firstName ?? '',
      lastName: row.lastName ?? '',
      displayName: row.displayName ?? '',
      avatarUrl: row.avatarUrl ?? null,
      email: opts.includeEmail && typeof row.email === 'string' ? row.email : null,
      workspaceRole: row.workspaceRole,
      accountActive: Boolean(row.accountActive),
    }));

    return { members, total };
  }

  async countAssignedAdmins(
    projectId: string,
    implicitRoles?: readonly WorkspaceRole[],
  ): Promise<number> {
    const adminCounts = await assignedProjectAdmins(
      this.dataSource.manager,
      [projectId],
      implicitRoles,
    );
    return adminCounts.get(projectId) ?? 0;
  }


  async searchCandidates(
    input: SearchProjectMemberCandidatesInput,
  ): Promise<ProjectMemberCandidateDbRow[]> {
    const qb = this.dataSource.manager
      .createQueryBuilder(User, 'u')
      .innerJoin(
        WorkspaceMember,
        'wm',
        'wm.memberId = u.id AND wm.workspaceId = :workspaceId AND wm.isActive = true',
      );

    const membership = qb
      .subQuery()
      .select('1')
      .from(ProjectMember, 'pm')
      .where('pm.projectId = :projectId')
      .andWhere('pm.memberId = u.id')
      .andWhere('pm.isActive = true')
      .getQuery();

    qb.select('u.id', 'userId')
      .addSelect('u.firstName', 'firstName')
      .addSelect('u.lastName', 'lastName')
      .addSelect('u.displayName', 'displayName')
      .addSelect('u.avatar', 'avatarUrl')
      .addSelect('wm.role', 'workspaceRole')
      .addSelect(`EXISTS ${membership}`, 'alreadyMember');

    if (input.mode === 'contains') {
      const escaped = escapeLikePattern(input.query);
      qb.addSelect('u.email', 'email')
        .where(ADDABLE_USER)
        .andWhere(`lower(u.email) LIKE :patternAny ESCAPE '\\'`)
        .orderBy('(lower(u.email) = :query)', 'DESC')
        .addOrderBy(`(lower(u.email) LIKE :patternPrefix ESCAPE '\\')`, 'DESC')
        .addOrderBy('lower(u.email)', 'ASC')
        .setParameter('workspaceId', input.workspaceId)
        .setParameter('projectId', input.projectId)
        .setParameter('query', input.query)
        .setParameter('patternAny', `%${escaped}%`)
        .setParameter('patternPrefix', `${escaped}%`);
    } else {
      qb.where({
        ...ADDABLE_USER,
        email: equalsLowercase(input.query),
      })
        .setParameter('workspaceId', input.workspaceId)
        .setParameter('projectId', input.projectId);
    }

    const rows = await qb
      .limit(input.limit)
      .getRawMany<RawCandidateRow>();

    return rows.map((r) => ({
      userId: r.userId,
      firstName: r.firstName,
      lastName: r.lastName,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      email: input.mode === 'contains' ? (r.email ?? null) : null,
      workspaceRole: r.workspaceRole,
      alreadyMember: Boolean(r.alreadyMember),
    }));
  }

  async addMembers(input: AddProjectMembersInput): Promise<AddProjectMembersResult> {
    try {
      return await runTransactionWithRetry(
        this.dataSource,
        (manager) => addMembersOnce(manager, this.accessResolver, input),
        {
          maxAttempts: MAX_ADD_ATTEMPTS,
          retryOnUnique: PROJECT_MEMBER_UNIQUE,
          onRetry: (attempt) => {
            this.logger.warn(
              `project.members.add.retry projectId=${input.projectId} attempt=${attempt} requestId=${input.requestId}`,
            );
          },
        },
      );
    } catch (err: unknown) {
      // Every other reference is locked before the write, so only a role the
      // `roles` table no longer holds can break a foreign key here.
      if (isForeignKeyViolation(err)) {
        this.logger.warn(
          `project.members.add.role_unknown projectId=${input.projectId} requestId=${input.requestId}`,
        );
        return { status: 'role_unknown' };
      }
      throw err;
    }
  }
}

/**
 * One attempt inside one transaction. Returning early before any write
 * simply commits an empty transaction, so no manual rollback is needed.
 */
async function addMembersOnce(
  manager: EntityManager,
  accessResolver: ProjectAccessResolver,
  input: AddProjectMembersInput,
): Promise<AddProjectMembersResult> {
  const { workspaceId, projectId, actorId, now } = input;

  // 1. FOR SHARE: project exists and is active
  const project = await manager.findOne(Project, {
    select: { id: true },
    where: { id: projectId, workspaceId, ...ACTIVE_PROJECT },
    lock: { mode: 'pessimistic_read' },
  });
  if (project === null) return { status: 'project_gone' };

  // 2. Lock addable users in targetIds in ID order
  const targetIds = input.members.map((m) => m.userId);
  const addableUsers =
    targetIds.length === 0
      ? []
      : await manager.find(User, {
          select: { id: true },
          where: { id: In(targetIds), ...ADDABLE_USER },
          order: { id: 'ASC' },
          lock: { mode: 'pessimistic_read' },
        });
  const addableIds = new Set(addableUsers.map((u) => u.id));

  // 3. Lock active workspace memberships of actor and targets in memberId order
  const allMemberIds = [actorId, ...targetIds];
  const wmList = await manager.find(WorkspaceMember, {
    select: { id: true, memberId: true, role: true, roleScope: true, isActive: true },
    where: { workspaceId, memberId: In(allMemberIds), isActive: true },
    order: { memberId: 'ASC' },
    lock: { mode: 'pessimistic_read' },
  });
  const wmActor = wmList.find((w) => w.memberId === actorId);
  if (wmActor === undefined) return { status: 'actor_forbidden' };

  // 4. Lock project memberships of actor and targets in memberId order (both active and inactive)
  const pmList = await manager.find(ProjectMember, {
    select: { id: true, memberId: true, role: true, roleScope: true, isActive: true },
    where: { projectId, memberId: In(allMemberIds) },
    order: { memberId: 'ASC' },
    lock: { mode: 'pessimistic_write' },
  });

  // 5. Decision on actor, from the rows locked above. Access is decided by
  // the same resolver the guard uses.
  const pmActor = pmList.find((p) => p.memberId === actorId && p.isActive);
  const actorAccess = await accessResolver.forMembership(manager, {
    workspaceRole: wmActor.role,
    assignedRole: pmActor?.role ?? null,
  });
  if (actorAccess === null) return { status: 'actor_forbidden' };

  const granted = await loadRolePermissions(manager, [
    { scope: wmActor.roleScope, key: wmActor.role },
  ]);
  const actorContext: AddProjectMembersActorContext = {
    actor: toProjectActor(actorId, wmActor.role, actorAccess),
    projectPermissions: actorAccess.permissions,
    workspacePermissions: parseWorkspacePermissions(
      granted.get(rolePermissionsKey(wmActor.roleScope, wmActor.role)) ?? [],
    ),
  };

  if (!input.canAdd(actorContext)) {
    return { status: 'actor_forbidden' };
  }

  const allowedRange = input.roleRange(actorContext);
  if (input.members.some((m) => !allowedRange.includes(m.role))) {
    return { status: 'role_forbidden' };
  }

  // 6. Evaluate row errors in priority order
  const wmByMember = new Map(wmList.map((w) => [w.memberId, w]));
  const pmByMember = new Map(pmList.map((p) => [p.memberId, p]));

  const rejected: { index: number; reason: ProjectMemberNotAddableReason }[] = [];
  input.members.forEach((m, index) => {
    const wm = wmByMember.get(m.userId);
    if (wm === undefined) {
      rejected.push({ index, reason: 'not_in_workspace' });
      return;
    }
    if (!addableIds.has(m.userId)) {
      rejected.push({ index, reason: 'unavailable' });
      return;
    }
    const reason = input.rowRejection(
      actorContext,
      {
        userId: m.userId,
        workspaceRole: wm.role,
        alreadyMember: pmByMember.get(m.userId)?.isActive === true,
      },
      m.role,
    );
    if (reason !== null) rejected.push({ index, reason });
  });

  if (rejected.length > 0) {
    return { status: 'rejected', rows: rejected };
  }

  // 7. Write in memberId order
  const ordered = [...input.members].sort((a, b) => compareIds(a.userId, b.userId));
  const toInsert = ordered.filter((m) => !pmByMember.has(m.userId));
  if (toInsert.length > 0) {
    await manager.insert(
      ProjectMember,
      toInsert.map((m) => ({
        workspaceId,
        projectId,
        memberId: m.userId,
        roleScope: 'project' as const,
        role: m.role,
        isActive: true,
        createdById: actorId,
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  const reactivated = ordered.filter((m) => {
    const pm = pmByMember.get(m.userId);
    return pm !== undefined && !pm.isActive;
  });
  for (const [role, memberIds] of groupByRole(reactivated)) {
    await manager.update(
      ProjectMember,
      {
        id: In(memberIds.map((memberId) => pmByMember.get(memberId)!.id)),
      },
      { role, isActive: true, joinedAt: now, updatedAt: now },
    );
  }

  // 8. History
  await manager.insert(
    ProjectMemberRoleHistory,
    ordered.map((m) => ({
      workspaceId,
      projectId,
      memberId: m.userId,
      roleScope: 'project' as const,
      fromRole: null,
      toRole: m.role,
      changeType: 'member_added' as const,
      actorId,
      requestId: input.requestId,
      createdAt: now,
    })),
  );

  // 9. Read back, in the same shape as `list`
  const readRows = await selectProjectMemberColumns(
    projectMembersQuery(manager, { projectId, memberId: In(targetIds) }),
    input.includeEmail,
  ).getRawMany<ProjectMemberDbRow>();
  const byUserId = new Map(
    readRows.map((row) => [row.userId, toMemberDbRow(row, input.includeEmail)]),
  );

  const adminCounts = await assignedProjectAdmins(manager, [projectId]);
  const assignedAdminCount = adminCounts.get(projectId) ?? 0;

  return {
    status: 'added',
    members: input.members.map((m) => byUserId.get(m.userId)!),
    reactivatedCount: reactivated.length,
    assignedAdminCount,
  };
}

/** The columns of one project member row, shared by `list` and the read-back after `addMembers`. */
function selectProjectMemberColumns(
  qb: SelectQueryBuilder<ProjectMember>,
  includeEmail: boolean,
): SelectQueryBuilder<ProjectMember> {
  qb.select('pm.memberId', 'userId')
    .addSelect('u.firstName', 'firstName')
    .addSelect('u.lastName', 'lastName')
    .addSelect('u.displayName', 'displayName')
    .addSelect('u.avatar', 'avatarUrl')
    .addSelect('pm.role', 'assignedRole')
    .addSelect('wm.role', 'workspaceRole')
    .addSelect('pm.joinedAt', 'joinedAt')
    .addSelect('u.isActive', 'accountActive');
  if (includeEmail) qb.addSelect('u.email', 'email');
  return qb;
}

function toMemberDbRow(
  row: ProjectMemberDbRow,
  includeEmail: boolean,
): ProjectMemberDbRow {
  return {
    userId: row.userId,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    email: includeEmail ? (row.email ?? null) : null,
    assignedRole: row.assignedRole,
    workspaceRole: row.workspaceRole,
    joinedAt: row.joinedAt,
    accountActive: row.accountActive,
  };
}

function compareIds(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  return left < right ? -1 : left > right ? 1 : 0;
}

function groupByRole(
  members: readonly { userId: string; role: ProjectRole }[],
): Map<ProjectRole, string[]> {
  const groups = new Map<ProjectRole, string[]>();
  for (const m of members) {
    const ids = groups.get(m.role);
    if (ids === undefined) groups.set(m.role, [m.userId]);
    else ids.push(m.userId);
  }
  return groups;
}
