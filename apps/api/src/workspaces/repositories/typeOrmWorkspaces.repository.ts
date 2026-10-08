import { Injectable } from '@nestjs/common';
import type {
  EditableWorkspaceField,
  OrganizationSize,
  WorkspaceRole,
} from '@repo/contracts';
import { DataSource } from 'typeorm';
import {
  SlugAlreadyExistsError,
  WorkspacesRepository,
  type CreateWorkspaceResult,
  type MemberWorkspace,
  type NewWorkspace,
  type WorkspaceChanges,
} from './workspaces.repository.js';

/** API field → column. The only columns PATCH may write (RQ 5.3). */
const EDITABLE_COLUMNS = {
  name: 'name',
  organizationSize: 'organization_size',
  timezone: 'timezone',
} as const satisfies Record<EditableWorkspaceField, string>;

@Injectable()
export class TypeOrmWorkspacesRepository implements WorkspacesRepository {
  constructor(private readonly dataSource: DataSource) {}

  async slugExists(slug: string): Promise<boolean> {
    const result = await this.dataSource.query<{ taken: boolean }[]>(
      'SELECT EXISTS (SELECT 1 FROM workspaces WHERE slug = $1) AS taken',
      [slug],
    );
    return Boolean(result[0]?.taken);
  }

  async create(
    userId: string,
    input: NewWorkspace,
    now: Date,
  ): Promise<CreateWorkspaceResult> {
    return this.dataSource.transaction(async (manager) => {
      // 1. Advisory transaction lock for concurrent requests by the same user
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('workspace-create:' || $1, 0))`,
        [userId],
      );

      // 2. Rate limit count (max 5 per 1 hour rolling window)
      const rateCheck = await manager.query<
        { created: number; oldest: Date | null }[]
      >(
        `SELECT count(*)::int AS created, min(created_at) AS oldest
         FROM workspaces
         WHERE created_by_id = $1 AND created_at > $2::timestamptz - interval '1 hour'`,
        [userId, now],
      );

      const createdCount = Number(rateCheck[0]?.created ?? 0);
      const oldest = rateCheck[0]?.oldest ? new Date(rateCheck[0].oldest) : null;
      if (createdCount >= 5 && oldest) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((oldest.getTime() + 3600000 - now.getTime()) / 1000),
        );
        return { status: 'rate_limited', retryAfterSeconds };
      }

      // 3. Insert workspace with owner check on user
      try {
        const inserted = await manager.query<
          {
            id: string;
            name: string;
            slug: string;
            logo: string | null;
            background_color: string;
            organization_size: OrganizationSize;
            timezone: string;
            created_at: Date;
            updated_at: Date;
          }[]
        >(
          `INSERT INTO workspaces (id, name, slug, owner_id, created_by_id, updated_by_id,
                                  organization_size, timezone, background_color, created_at, updated_at)
           SELECT $1, $2, $3, u.id, u.id, u.id, $4, u.user_timezone, $5, $6, $6
           FROM users u
           WHERE u.id = $7 AND u.is_active AND u.masked_at IS NULL
           RETURNING id, name, slug, logo, background_color, organization_size, timezone, created_at, updated_at`,
          [
            input.id,
            input.name,
            input.slug,
            input.organizationSize,
            input.backgroundColor,
            now,
            userId,
          ],
        );

        if (!inserted || inserted.length === 0) {
          return { status: 'user_inactive' };
        }

        const row = inserted[0]!;

        // 4. Insert owner into workspace_members
        await manager.query(
          `INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at)
           VALUES ($1, $2, 'owner', $3, $3)`,
          [row.id, userId, now],
        );

        // 5. Update user's last_workspace_id
        await manager.query(
          `UPDATE users SET last_workspace_id = $1 WHERE id = $2`,
          [row.id, userId],
        );

        return {
          status: 'created',
          workspace: {
            id: row.id,
            name: row.name,
            slug: row.slug,
            logo: row.logo,
            backgroundColor: row.background_color,
            organizationSize: row.organization_size,
            timezone: row.timezone,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
            role: 'owner',
            memberCount: 1,
          },
        };
      } catch (err: unknown) {
        if (
          err !== null &&
          typeof err === 'object' &&
          'driverError' in err &&
          typeof (err as { driverError: unknown }).driverError === 'object' &&
          (err as { driverError: { code?: string; constraint?: string } })
            .driverError?.code === '23505' &&
          (err as { driverError: { code?: string; constraint?: string } })
            .driverError?.constraint === 'workspaces_slug_key'
        ) {
          throw new SlugAlreadyExistsError(`Slug ${input.slug} is already taken`);
        }
        throw err;
      }
    });
  }

  async listForMember(
    userId: string,
  ): Promise<{ workspaces: MemberWorkspace[]; lastWorkspaceId: string | null }> {
    const rows = await this.dataSource.query<
      {
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
        memberCount: number;
        isLast: boolean;
      }[]
    >(
      `SELECT w.id, w.name, w.slug, w.logo, w.background_color AS "backgroundColor",
              w.organization_size AS "organizationSize", w.timezone,
              w.created_at AS "createdAt", w.updated_at AS "updatedAt", m.role,
              (SELECT count(*)::int FROM workspace_members c
                WHERE c.workspace_id = w.id AND c.is_active = true) AS "memberCount",
              (u.last_workspace_id = w.id) AS "isLast"
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
       JOIN users u      ON u.id = m.member_id
       WHERE m.member_id = $1 AND m.is_active = true
       ORDER BY lower(w.name), w.created_at`,
      [userId],
    );

    let lastWorkspaceId: string | null = null;
    const workspaces: MemberWorkspace[] = rows.map((r) => {
      if (r.isLast) {
        lastWorkspaceId = r.id;
      }
      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        logo: r.logo,
        backgroundColor: r.backgroundColor,
        organizationSize: r.organizationSize,
        timezone: r.timezone,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
        role: r.role,
        memberCount: Number(r.memberCount),
      };
    });

    return { workspaces, lastWorkspaceId };
  }

  async findForMember(
    slug: string,
    userId: string,
  ): Promise<MemberWorkspace | null> {
    const rows = await this.dataSource.query<
      {
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
        memberCount: number;
      }[]
    >(
      `SELECT w.id, w.name, w.slug, w.logo, w.background_color AS "backgroundColor",
              w.organization_size AS "organizationSize", w.timezone,
              w.created_at AS "createdAt", w.updated_at AS "updatedAt", m.role,
              (SELECT count(*)::int FROM workspace_members c
                WHERE c.workspace_id = w.id AND c.is_active = true) AS "memberCount"
       FROM workspaces w
       JOIN workspace_members m
         ON m.workspace_id = w.id AND m.member_id = $2 AND m.is_active = true
       WHERE w.slug = $1 AND w.deleted_at IS NULL`,
      [slug, userId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
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
      memberCount: Number(row.memberCount),
    };
  }

  async rememberLastWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE users SET last_workspace_id = $1
       WHERE id = $2 AND last_workspace_id IS DISTINCT FROM $1`,
      [workspaceId, userId],
    );
  }

  async update(
    workspaceId: string,
    actorId: string,
    changes: WorkspaceChanges,
    now: Date,
  ): Promise<{ updatedAt: Date } | null> {
    const keys = (
      Object.keys(EDITABLE_COLUMNS) as EditableWorkspaceField[]
    ).filter((k) => changes[k] !== undefined);
    if (keys.length === 0) {
      throw new Error('update called without changes');
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (const key of keys) {
      const col = EDITABLE_COLUMNS[key];
      setClauses.push(`${col} = $${paramIndex++}`);
      params.push(changes[key]);
    }

    setClauses.push(`updated_by_id = $${paramIndex++}`);
    params.push(actorId);

    setClauses.push(`updated_at = $${paramIndex++}`);
    params.push(now);

    params.push(workspaceId);
    const idParamIndex = paramIndex++;

    const sql = `UPDATE workspaces
SET ${setClauses.join(', ')}
WHERE id = $${idParamIndex}
  AND deleted_at IS NULL
RETURNING updated_at AS "updatedAt"`;

    const rows = await this.dataSource.query(sql, params);
    const row = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
    if (!row) {
      return null;
    }
    const rawDate = row.updatedAt ?? row.updated_at;
    if (!rawDate) {
      throw new Error('update RETURNING did not return a valid timestamp');
    }
    return { updatedAt: new Date(rawDate) };
  }
}

