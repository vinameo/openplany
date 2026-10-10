import { Injectable } from '@nestjs/common';
import {
  EDITABLE_WORKSPACE_FIELDS,
  WORKSPACE_CREATOR_ROLE,
  parseWorkspacePermissions,
  type OrganizationSize,
  type RoleScope,
  type WorkspaceRole,
} from '@repo/contracts';
import { DataSource, IsNull, type EntityManager } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { isUniqueViolation } from '../../common/databaseErrors.js';
import {
  loadRolePermissions,
  rolePermissionsKey,
} from '../../roles/rolePermissionsQuery.js';
import { Workspace } from '../entities/workspace.entity.js';
import { WorkspaceMember } from '../entities/workspaceMember.entity.js';
import {
  SlugAlreadyExistsError,
  WorkspacesRepository,
  type CreateWorkspaceResult,
  type MemberWorkspace,
  type NewWorkspace,
  type WorkspaceChanges,
} from './workspaces.repository.js';
import { recordWorkspaceRoleChanges } from './workspaceRoleHistory.js';

const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60 * 60 * 1000;

/** One row of memberWorkspaces(): a workspace plus the member's role. */
interface MemberWorkspaceRow {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  backgroundColor: string;
  organizationSize: OrganizationSize;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
  role: WorkspaceRole;
  roleScope: RoleScope;
  memberCount: number;
}

@Injectable()
export class TypeOrmWorkspacesRepository implements WorkspacesRepository {
  constructor(private readonly dataSource: DataSource) {}

  slugExists(slug: string): Promise<boolean> {
    // Workspace.deletedAt is a plain column, so soft-deleted rows count too (4.1).
    return this.dataSource.getRepository(Workspace).existsBy({ slug });
  }

  async create(
    userId: string,
    input: NewWorkspace,
    now: Date,
    requestId: string | null,
  ): Promise<CreateWorkspaceResult> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Serialize concurrent creates by the same user. TypeORM has no
      //    advisory-lock API; the key is a bound parameter.
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('workspace-create:' || $1, 0))`,
        [userId],
      );

      // 2. At most CREATE_LIMIT workspaces per rolling hour.
      const recent = await manager
        .createQueryBuilder(Workspace, 'w')
        .select('count(*)::int', 'created')
        .addSelect('min(w.createdAt)', 'oldest')
        .where('w.createdById = :userId', { userId })
        .andWhere('w.createdAt > :since', {
          since: new Date(now.getTime() - CREATE_WINDOW_MS),
        })
        .getRawOne<{ created: number; oldest: Date | null }>();
      if (Number(recent?.created ?? 0) >= CREATE_LIMIT && recent?.oldest) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            (new Date(recent.oldest).getTime() +
              CREATE_WINDOW_MS -
              now.getTime()) /
              1000,
          ),
        );
        return { status: 'rate_limited', retryAfterSeconds };
      }

      // 3. The creator must still be usable; FOR SHARE keeps them so until commit.
      const creator = await manager.findOne(User, {
        select: { id: true, timezone: true },
        where: { id: userId, isActive: true, maskedAt: IsNull() },
        lock: { mode: 'pessimistic_read' },
      });
      if (creator === null) {
        return { status: 'user_inactive' };
      }

      // 4. Workspace row, creator as WORKSPACE_CREATOR_ROLE, role history.
      try {
        await manager.insert(Workspace, {
          id: input.id,
          name: input.name,
          slug: input.slug,
          createdById: userId,
          updatedById: userId,
          organizationSize: input.organizationSize,
          timezone: creator.timezone,
          backgroundColor: input.backgroundColor,
          createdAt: now,
          updatedAt: now,
        });
      } catch (err: unknown) {
        if (isUniqueViolation(err, 'workspaces_slug_key')) {
          throw new SlugAlreadyExistsError(
            `Slug ${input.slug} is already taken`,
          );
        }
        throw err;
      }

      await manager.insert(WorkspaceMember, {
        workspaceId: input.id,
        memberId: userId,
        role: WORKSPACE_CREATOR_ROLE,
        roleScope: 'workspace',
        joinedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await recordWorkspaceRoleChanges(manager, [
        {
          workspaceId: input.id,
          memberId: userId,
          fromRole: null,
          toRole: WORKSPACE_CREATOR_ROLE,
          changeType: 'workspace_created',
          actorId: userId,
          requestId,
          at: now,
        },
      ]);

      await manager.update(User, { id: userId }, { lastWorkspaceId: input.id });

      const permissions = await loadRolePermissions(manager, [
        { scope: 'workspace', key: WORKSPACE_CREATOR_ROLE },
      ]);

      return {
        status: 'created',
        workspace: {
          id: input.id,
          name: input.name,
          slug: input.slug,
          logo: null,
          backgroundColor: input.backgroundColor,
          organizationSize: input.organizationSize,
          timezone: creator.timezone,
          createdAt: now,
          updatedAt: now,
          role: WORKSPACE_CREATOR_ROLE,
          permissions: parseWorkspacePermissions(
            permissions.get(
              rolePermissionsKey('workspace', WORKSPACE_CREATOR_ROLE),
            ) ?? [],
          ),
          memberCount: 1,
        },
      };
    });
  }

  async listForMember(
    userId: string,
  ): Promise<{
    workspaces: MemberWorkspace[];
    lastWorkspaceId: string | null;
  }> {
    const manager = this.dataSource.manager;
    const [rows, user] = await Promise.all([
      memberWorkspaces(manager, userId)
        .orderBy('lower(w.name)', 'ASC')
        .addOrderBy('w.createdAt', 'ASC')
        .getRawMany<MemberWorkspaceRow>(),
      manager.findOne(User, {
        select: { id: true, lastWorkspaceId: true },
        where: { id: userId },
      }),
    ]);

    const workspaces = await withPermissions(manager, rows);
    const lastWorkspaceId =
      workspaces.find((w) => w.id === user?.lastWorkspaceId)?.id ?? null;
    return { workspaces, lastWorkspaceId };
  }

  async findForMember(
    slug: string,
    userId: string,
  ): Promise<MemberWorkspace | null> {
    const manager = this.dataSource.manager;
    const row = await memberWorkspaces(manager, userId)
      .andWhere('w.slug = :slug', { slug })
      .getRawOne<MemberWorkspaceRow>();
    if (row === undefined) return null;

    const [workspace] = await withPermissions(manager, [row]);
    return workspace ?? null;
  }

  async rememberLastWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(User)
      .set({ lastWorkspaceId: workspaceId })
      .where('id = :userId', { userId })
      .andWhere('last_workspace_id IS DISTINCT FROM :workspaceId', {
        workspaceId,
      })
      .execute();
  }

  async update(
    workspaceId: string,
    actorId: string,
    changes: WorkspaceChanges,
    now: Date,
  ): Promise<{ updatedAt: Date } | null> {
    // Only fields listed in EDITABLE_WORKSPACE_FIELDS are ever written (RQ 5.3).
    const editable: WorkspaceChanges = {};
    for (const field of EDITABLE_WORKSPACE_FIELDS) {
      if (changes[field] !== undefined) {
        Object.assign(editable, { [field]: changes[field] });
      }
    }
    if (Object.keys(editable).length === 0) {
      throw new Error('update called without changes');
    }

    const result = await this.dataSource
      .createQueryBuilder()
      .update(Workspace)
      .set({ ...editable, updatedById: actorId, updatedAt: now })
      .where('id = :workspaceId', { workspaceId })
      .andWhere('deleted_at IS NULL')
      .returning('updated_at')
      .execute();

    const [row] = result.raw as { updated_at: Date }[];
    return row === undefined ? null : { updatedAt: new Date(row.updated_at) };
  }
}

/** Active, non-deleted workspaces of one member, with the member's role and head count. */
function memberWorkspaces(manager: EntityManager, userId: string) {
  return manager
    .createQueryBuilder(WorkspaceMember, 'm')
    .innerJoin(Workspace, 'w', 'w.id = m.workspaceId AND w.deletedAt IS NULL')
    .select('w.id', 'id')
    .addSelect('w.name', 'name')
    .addSelect('w.slug', 'slug')
    .addSelect('w.logo', 'logo')
    .addSelect('w.backgroundColor', 'backgroundColor')
    .addSelect('w.organizationSize', 'organizationSize')
    .addSelect('w.timezone', 'timezone')
    .addSelect('w.createdAt', 'createdAt')
    .addSelect('w.updatedAt', 'updatedAt')
    .addSelect('m.role', 'role')
    .addSelect('m.roleScope', 'roleScope')
    .addSelect(
      (count) =>
        count
          .select('count(*)::int')
          .from(WorkspaceMember, 'c')
          .where('c.workspaceId = w.id')
          .andWhere('c.isActive = true'),
      'memberCount',
    )
    .where('m.memberId = :userId', { userId })
    .andWhere('m.isActive = true');
}

async function withPermissions(
  manager: EntityManager,
  rows: readonly MemberWorkspaceRow[],
): Promise<MemberWorkspace[]> {
  const permissions = await loadRolePermissions(
    manager,
    rows.map((row) => ({ scope: row.roleScope, key: row.role })),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    backgroundColor: row.backgroundColor,
    organizationSize: row.organizationSize,
    timezone: row.timezone,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    role: row.role,
    permissions: parseWorkspacePermissions(
      permissions.get(rolePermissionsKey(row.roleScope, row.role)) ?? [],
    ),
    memberCount: Number(row.memberCount),
  }));
}
