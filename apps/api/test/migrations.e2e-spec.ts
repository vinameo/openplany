import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import { MIGRATIONS } from './e2eGlobalSetup.js';
import { e2eEnv } from './e2eEnv.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';
import { PROJECT_ROLE_RANK } from '@repo/contracts';
import { DEFAULT_PROJECT_ACCESS_POLICIES } from '@repo/contracts/testing';
import { MIGRATION_PROJECT_ROLE_RANK } from '../src/database/migrations/1791610200000-ApplyProjectAccessPolicies.js';
import { EnableUnaccent1791610400000 } from '../src/database/migrations/1791610400000-EnableUnaccent.js';

/**
 * Migrations meet real data (CLAUDE.md §8 design pass): the newest migrations
 * are reverted one by one and re-applied over a database that holds the
 * awkward but legal rows production will have. After each down() the schema
 * must equal a fresh database built up to that version, and the final schema
 * must equal the start. A new migration is the newest one, so it is covered.
 */
const ROUNDTRIP_COUNT = 6;

const MIGRATIONS_DIR = join(import.meta.dirname, '../src/database/migrations');

async function schemaSnapshot(ds: DataSource): Promise<unknown> {
  const columns: unknown = await ds.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name <> 'typeorm_migrations'
    ORDER BY table_name, column_name`);
  const indexes: unknown = await ds.query(`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' ORDER BY indexname`);
  const constraints: unknown = await ds.query(`
    SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE connamespace = 'public'::regnamespace
    ORDER BY table_name, conname`);
  const extensions: unknown = await ds.query(`
    SELECT extname FROM pg_extension
    WHERE extname <> 'uuid-ossp'
    ORDER BY extname`);
  return { columns, indexes, constraints, extensions };
}

/** Schema of a fresh database at each of the last `count` + 1 versions, oldest first. */
async function referenceSchemas(count: number): Promise<unknown[]> {
  const url = new URL(e2eEnv().DATABASE_URL);
  const refDb = `${url.pathname.slice(1)}_migref`;
  if (!/^[a-z0-9_]+$/.test(refDb)) {
    throw new Error(`Refusing to create database "${refDb}"`);
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
  await admin.initialize();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${refDb}`);
    await admin.query(`CREATE DATABASE ${refDb}`);
    const refUrl = new URL(url);
    refUrl.pathname = `/${refDb}`;
    const schemas: unknown[] = [];
    for (let k = MIGRATIONS.length - count; k <= MIGRATIONS.length; k += 1) {
      const ds = new DataSource({
        type: 'postgres',
        url: refUrl.toString(),
        migrations: MIGRATIONS.slice(0, k),
        migrationsTableName: 'typeorm_migrations',
      });
      await ds.initialize();
      try {
        await ds.runMigrations({ transaction: 'each' });
        schemas.push(await schemaSnapshot(ds));
      } finally {
        await ds.destroy();
      }
    }
    return schemas;
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS ${refDb}`);
    await admin.destroy();
  }
}

describe('Migrations (e2e)', () => {
  let e2e: E2eApp;
  let migrationsDs: DataSource;

  beforeAll(async () => {
    e2e = await createE2eApp();
    migrationsDs = new DataSource({
      type: 'postgres',
      url: e2eEnv().DATABASE_URL,
      migrations: MIGRATIONS,
      migrationsTableName: 'typeorm_migrations',
    });
    await migrationsDs.initialize();
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await migrationsDs.destroy();
    await e2e.app.close();
  });

  it('registers every migration file for the e2e database', () => {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();
    const registered = MIGRATIONS.map((m) => {
      const name = new m().name;
      if (name === undefined) throw new Error(`${m.name} has no name`);
      // ClassName1791607000000 -> 1791607000000-ClassName
      const match = /^(.*?)(\d{13})$/.exec(name);
      return match ? `${match[2]}-${match[1]}` : name;
    }).sort();
    expect(registered).toEqual(files);
  });

  it(`reverts the newest ${ROUNDTRIP_COUNT} migrations one by one over realistic data, each down() matching a fresh database, then re-applies them`, async () => {
    // Awkward but legal rows: deactivated account, former member, role
    // history, soft-deleted project, project membership.
    const ownerId = await createUser(e2e, 'owner-mig@openplany.dev', {
      is_superuser: true,
    });
    const formerId = await createUser(e2e, 'former-mig@openplany.dev');
    await createUser(e2e, 'off-mig@openplany.dev', { is_active: false });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'owner-mig@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({ name: 'Mig', slug: 'mig', organizationSize: '2-10' })
      .expect(201);
    const ws = { id: created.body.id as string };
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active)
       VALUES ($1, $2, 'member', false)`,
      [ws.id, formerId],
    );
    const [active] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Web', 'WEB', 'square-check', '#868E96', 'cover-01', 'Asia/Tokyo') RETURNING id`,
      [ws.id],
    );
    await e2e.dataSource.query(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, deleted_at)
       VALUES ($1, 'Web', 'OLD', 'square-check', '#868E96', 'cover-01', now())`,
      [ws.id],
    );
    const guestId = await createUser(e2e, 'guest-mig@openplany.dev');
    const memberViewerId = await createUser(e2e, 'mem-view-mig@openplany.dev');
    const memberContribId = await createUser(
      e2e,
      'mem-contrib-mig@openplany.dev',
    );
    const formerAdminId = await createUser(
      e2e,
      'former-admin-mig@openplany.dev',
    );

    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active)
       VALUES ($1, $2, 'guest', true),
              ($1, $3, 'member', true),
              ($1, $4, 'member', true),
              ($1, $5, 'admin', false)`,
      [ws.id, guestId, memberViewerId, memberContribId, formerAdminId],
    );

    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active)
       VALUES ($1, $2, $3, 'admin', true),
              ($1, $2, $4, 'contributor', false),
              ($1, $2, $5, 'contributor', true),
              ($1, $2, $6, 'viewer', true),
              ($1, $2, $7, 'contributor', true),
              ($1, $2, $8, 'admin', true)`,
      [
        active!.id,
        ws.id,
        ownerId,
        formerId,
        guestId,
        memberViewerId,
        memberContribId,
        formerAdminId,
      ],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, from_role, to_role, change_type, actor_id)
       VALUES ($1, $2, $3, NULL, 'admin', 'project_created', $3)`,
      [ws.id, active!.id, ownerId],
    );
    await e2e.dataSource.query(
      `INSERT INTO role_permission_history (scope, role_key, permission_key, change_type, actor_id, request_id)
       VALUES ('project', 'viewer', 'project.workitems.view', 'granted', $1, 'req-viewer-1')`,
      [ownerId],
    );

    // reference[i] = schema of a fresh database with the newest
    // ROUNDTRIP_COUNT - i migrations not yet applied.
    const reference = await referenceSchemas(ROUNDTRIP_COUNT);
    const before = await schemaSnapshot(migrationsDs);
    expect(before, 'the e2e database is at the latest migration').toEqual(
      reference[ROUNDTRIP_COUNT],
    );
    try {
      for (let i = 1; i <= ROUNDTRIP_COUNT; i += 1) {
        await migrationsDs.undoLastMigration({ transaction: 'each' });
        const name = MIGRATIONS[MIGRATIONS.length - i]!.name;
        expect(
          await schemaSnapshot(migrationsDs),
          `down() of ${name} restores the previous schema`,
        ).toEqual(reference[ROUNDTRIP_COUNT - i]);
      }
    } finally {
      // Always leave the shared e2e database at the latest migration.
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
    expect(await schemaSnapshot(migrationsDs)).toEqual(before);

    // Verify backfill (B7): existing rows before up had joined_at = created_at
    const members = await migrationsDs.query<
      { member_id: string; joined_at: Date; created_at: Date }[]
    >(
      `SELECT member_id, joined_at, created_at FROM project_members WHERE project_id = $1`,
      [active!.id],
    );
    expect(members).toHaveLength(6);
    for (const m of members) {
      expect(m.joined_at).toEqual(m.created_at);
    }

    // Verify ApplyProjectAccessPolicies updates on realistic rows (AC-13, AC-14, DB B4.4)
    const activeProjectMembers = await migrationsDs.query<
      { member_id: string; role: string; is_active: boolean }[]
    >(
      `SELECT member_id, role, is_active FROM project_members WHERE project_id = $1 ORDER BY member_id`,
      [active!.id],
    );
    const memberMap = new Map(
      activeProjectMembers.map((m) => [m.member_id, m]),
    );
    expect(memberMap.get(ownerId)?.is_active).toBe(false);
    expect(memberMap.get(ownerId)?.role).toBe('admin');
    expect(memberMap.get(formerAdminId)?.is_active).toBe(false);
    expect(memberMap.get(formerAdminId)?.role).toBe('admin');
    expect(memberMap.get(guestId)?.is_active).toBe(true);
    expect(memberMap.get(guestId)?.role).toBe('viewer');
    expect(memberMap.get(memberViewerId)?.is_active).toBe(true);
    expect(memberMap.get(memberViewerId)?.role).toBe('commenter');
    expect(memberMap.get(memberContribId)?.is_active).toBe(true);
    expect(memberMap.get(memberContribId)?.role).toBe('contributor');
    expect(memberMap.get(formerId)?.is_active).toBe(false);
    expect(memberMap.get(formerId)?.role).toBe('contributor');

    const appliedHistory = await migrationsDs.query<
      { member_id: string; from_role: string; to_role: string | null }[]
    >(
      `SELECT member_id, from_role, to_role FROM project_member_role_history
       WHERE change_type = 'workspace_role_applied' AND request_id = 'migration:ApplyProjectAccessPolicies'
       ORDER BY member_id`,
    );
    expect(appliedHistory).toHaveLength(4);
    const historyMap = new Map(appliedHistory.map((h) => [h.member_id, h]));
    expect(historyMap.get(ownerId)).toMatchObject({
      from_role: 'admin',
      to_role: null,
    });
    expect(historyMap.get(formerAdminId)).toMatchObject({
      from_role: 'admin',
      to_role: null,
    });
    expect(historyMap.get(guestId)).toMatchObject({
      from_role: 'contributor',
      to_role: 'viewer',
    });
    expect(historyMap.get(memberViewerId)).toMatchObject({
      from_role: 'viewer',
      to_role: 'commenter',
    });

    // Verify role_permission_history round-trip
    const historyRows = await migrationsDs.query<
      { scope: string; role_key: string }[]
    >(
      `SELECT scope, role_key FROM role_permission_history WHERE scope = 'project' AND permission_key = 'project.workitems.view' AND change_type = 'granted'`,
    );
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0]!.role_key).toBe('viewer');
  });

  it('AC-01: M-03 is 0, project.guest has no rows and project.viewer has permissions', async () => {
    const res = await migrationsDs.query<{ m03: string | number }[]>(`
      SELECT (
        (SELECT count(*) FROM roles WHERE scope = 'project' AND key = 'guest') +
        (SELECT count(*) FROM role_permissions WHERE scope = 'project' AND role_key = 'guest') +
        (SELECT count(*) FROM project_members WHERE role = 'guest') +
        (SELECT count(*) FROM project_member_role_history WHERE 'guest' IN (from_role, to_role)) +
        (SELECT count(*) FROM role_permission_history WHERE scope = 'project' AND role_key = 'guest')
      ) AS m03
    `);
    expect(Number(res[0]?.m03 ?? 0)).toBe(0);

    const viewerPerms = await migrationsDs.query<{ count: string | number }[]>(`
      SELECT count(*) AS count FROM role_permissions WHERE scope = 'project' AND role_key = 'viewer'
    `);
    expect(Number(viewerPerms[0]?.count ?? 0)).toBe(10);
  });

  it('refuses to revert AddProjectMemberJoinedAt if member_added role history rows exist', async () => {
    const ownerId = await createUser(e2e, 'owner-mig-added@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'owner-mig-added@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({ name: 'Mig Added', slug: 'mig-added', organizationSize: '2-10' })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Mig Added Project', 'MAP', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, from_role, to_role, change_type, actor_id)
       VALUES ($1, $2, $3, NULL, 'contributor', 'member_added', $3)`,
      [wsId, project!.id, ownerId],
    );

    // Revert EnableUnaccent, AddProjectRoleChangedHistory, ApplyProjectAccessPolicies, CreateProjectAccessPolicies and RenameProjectGuestToViewer so AddProjectMemberJoinedAt is the last applied migration
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    const schemaBefore = await schemaSnapshot(migrationsDs);
    try {
      await expect(
        migrationsDs.undoLastMigration({ transaction: 'each' }),
      ).rejects.toThrow(
        /Cannot revert AddProjectMemberJoinedAt: 1 project role history rows use change_type 'member_added'/,
      );
      expect(await schemaSnapshot(migrationsDs)).toEqual(schemaBefore);
    } finally {
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
  });

  it('AC-03: seeds project_access_policies matching DEFAULT_PROJECT_ACCESS_POLICIES', async () => {
    const rows = await migrationsDs.query<
      {
        workspace_role: string;
        implicit_project_role: string | null;
        lowest_assignable_role: string;
        highest_assignable_role: string;
        overrides_project_rank: boolean;
      }[]
    >(
      `SELECT workspace_role, implicit_project_role, lowest_assignable_role, highest_assignable_role, overrides_project_rank
       FROM project_access_policies
       ORDER BY workspace_role`,
    );

    const fromDb = Object.fromEntries(
      rows.map((r) => [
        r.workspace_role,
        {
          workspaceRole: r.workspace_role,
          implicitProjectRole: r.implicit_project_role,
          lowestAssignableRole: r.lowest_assignable_role,
          highestAssignableRole: r.highest_assignable_role,
          overridesProjectRank: r.overrides_project_rank,
        },
      ]),
    );

    expect(fromDb).toEqual(DEFAULT_PROJECT_ACCESS_POLICIES);
  });

  it('AC-18: pap_implicit_range_check rejects implicit role with mismatched range', async () => {
    await migrationsDs.query('BEGIN');
    try {
      await expect(
        migrationsDs.query(
          `UPDATE project_access_policies
           SET lowest_assignable_role = 'viewer'
           WHERE workspace_role = 'admin'`,
        ),
      ).rejects.toThrow(/pap_implicit_range_check/);
    } finally {
      await migrationsDs.query('ROLLBACK');
    }
  });

  it('AC-03: MIGRATION_PROJECT_ROLE_RANK equals PROJECT_ROLE_RANK', () => {
    expect(MIGRATION_PROJECT_ROLE_RANK).toEqual(PROJECT_ROLE_RANK);
  });

  it('AC-13, AC-14: M-01 and M-02 metrics are 0 after ApplyProjectAccessPolicies', async () => {
    const m01Res = await migrationsDs.query<{ count: string | number }[]>(`
      SELECT count(*) AS count
      FROM project_members pm
      JOIN workspace_members wm ON wm.workspace_id = pm.workspace_id AND wm.member_id = pm.member_id AND wm.is_active
      JOIN project_access_policies p ON p.workspace_role = wm.role
      WHERE pm.is_active AND p.implicit_project_role IS NOT NULL
    `);
    expect(Number(m01Res[0]?.count ?? 0)).toBe(0);

    const m02Res = await migrationsDs.query<{ count: string | number }[]>(`
      SELECT count(*) AS count
      FROM project_members pm
      JOIN workspace_members wm ON wm.workspace_id = pm.workspace_id AND wm.member_id = pm.member_id AND wm.is_active
      WHERE pm.is_active AND ((wm.role = 'guest' AND pm.role <> 'viewer') OR (wm.role = 'member' AND pm.role = 'viewer'))
    `);
    expect(Number(m02Res[0]?.count ?? 0)).toBe(0);
  });

  it('refuses to revert ApplyProjectAccessPolicies if later workspace_role_applied role history rows exist', async () => {
    const ownerId = await createUser(e2e, 'owner-mig-later@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'owner-mig-later@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'Mig Later',
        slug: 'mig-later',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Mig Later Project', 'MLP', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, from_role, to_role, change_type, actor_id, request_id)
       VALUES ($1, $2, $3, 'viewer', 'commenter', 'workspace_role_applied', $3, 'req-later-change')`,
      [wsId, project!.id, ownerId],
    );

    // Revert EnableUnaccent and AddProjectRoleChangedHistory so ApplyProjectAccessPolicies is the last applied migration
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    const schemaBefore = await schemaSnapshot(migrationsDs);
    try {
      await expect(
        migrationsDs.undoLastMigration({ transaction: 'each' }),
      ).rejects.toThrow(
        /Cannot revert ApplyProjectAccessPolicies: 1 later role changes depend on it/,
      );
      expect(await schemaSnapshot(migrationsDs)).toEqual(schemaBefore);
    } finally {
      await e2e.dataSource.query(
        `DELETE FROM project_member_role_history WHERE request_id = 'req-later-change'`,
      );
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
  });

  it('AC-16: refuses to revert CreateProjectAccessPolicies if workspace_role_applied role history rows exist', async () => {
    // 1. Revert EnableUnaccent, AddProjectRoleChangedHistory and ApplyProjectAccessPolicies first (when no later changes exist, they revert cleanly)
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });

    const ownerId = await createUser(e2e, 'owner-mig-applied@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'owner-mig-applied@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'Mig Applied',
        slug: 'mig-applied',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Mig Applied Project', 'MAP2', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, from_role, to_role, change_type, actor_id, request_id)
       VALUES ($1, $2, $3, 'viewer', 'commenter', 'workspace_role_applied', $3, 'req-test-applied')`,
      [wsId, project!.id, ownerId],
    );

    const schemaBefore = await schemaSnapshot(migrationsDs);
    try {
      await expect(
        migrationsDs.undoLastMigration({ transaction: 'each' }),
      ).rejects.toThrow(
        /Cannot revert CreateProjectAccessPolicies: 1 project role history rows use change_type 'workspace_role_applied'/,
      );
      expect(await schemaSnapshot(migrationsDs)).toEqual(schemaBefore);
    } finally {
      await e2e.dataSource.query(
        `DELETE FROM project_member_role_history WHERE change_type = 'workspace_role_applied'`,
      );
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
  });

  it('AC-13, AC-14, AC-15: ApplyProjectAccessPolicies updates the 6 input rows and down() restores them', async () => {
    // 1. Revert EnableUnaccent, AddProjectRoleChangedHistory and ApplyProjectAccessPolicies first
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    await migrationsDs.undoLastMigration({ transaction: 'each' });

    // 2. Setup workspace and project with the 6 rows of AC-13
    const adminUser = await createUser(e2e, 'ac13-admin@openplany.dev', {
      is_superuser: true,
    });
    const guestUser = await createUser(e2e, 'ac13-guest@openplany.dev');
    const memberViewUser = await createUser(e2e, 'ac13-memview@openplany.dev');
    const memberContribUser = await createUser(
      e2e,
      'ac13-memcontrib@openplany.dev',
    );
    const formerAdminUser = await createUser(
      e2e,
      'ac13-formeradmin@openplany.dev',
    );
    const formerMemberUser = await createUser(
      e2e,
      'ac13-formermem@openplany.dev',
    );

    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'ac13-admin@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({ name: 'AC13 WS', slug: 'ac13-ws', organizationSize: '2-10' })
      .expect(201);
    const wsId = created.body.id as string;

    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active)
       VALUES ($1, $2, 'guest', true),
              ($1, $3, 'member', true),
              ($1, $4, 'member', true),
              ($1, $5, 'admin', false),
              ($1, $6, 'member', false)`,
      [
        wsId,
        guestUser,
        memberViewUser,
        memberContribUser,
        formerAdminUser,
        formerMemberUser,
      ],
    );

    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'AC13 Project', 'AC13P', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );
    const pId = project!.id;

    // (1) active Workspace Admin with 'admin'
    // (2) active Guest with 'contributor'
    // (3) active Member with 'viewer'
    // (4) active Member with 'contributor'
    // (5) active project member row with 'admin' whose workspace role was 'admin' but is now inactive
    // (6) active project member row with 'contributor' whose workspace role was 'member' but is now inactive
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active)
       VALUES ($1, $2, $3, 'admin', true),
              ($1, $2, $4, 'contributor', true),
              ($1, $2, $5, 'viewer', true),
              ($1, $2, $6, 'contributor', true),
              ($1, $2, $7, 'admin', true),
              ($1, $2, $8, 'contributor', true)`,
      [
        pId,
        wsId,
        adminUser,
        guestUser,
        memberViewUser,
        memberContribUser,
        formerAdminUser,
        formerMemberUser,
      ],
    );

    const schemaBeforeUp = await schemaSnapshot(migrationsDs);

    try {
      // 3. Run up() for ApplyProjectAccessPolicies
      await migrationsDs.runMigrations({ transaction: 'each' });

      // Check AC-13:
      // (1) and (5) is_active = false
      // (2) -> viewer
      // (3) -> commenter
      // (4) and (6) unchanged
      const rowsAfterUp = await migrationsDs.query<
        { member_id: string; role: string; is_active: boolean }[]
      >(
        `SELECT member_id, role, is_active FROM project_members WHERE project_id = $1`,
        [pId],
      );
      const afterMap = new Map(rowsAfterUp.map((r) => [r.member_id, r]));

      expect(afterMap.get(adminUser)).toMatchObject({
        is_active: false,
        role: 'admin',
      });
      expect(afterMap.get(formerAdminUser)).toMatchObject({
        is_active: false,
        role: 'admin',
      });
      expect(afterMap.get(guestUser)).toMatchObject({
        is_active: true,
        role: 'viewer',
      });
      expect(afterMap.get(memberViewUser)).toMatchObject({
        is_active: true,
        role: 'commenter',
      });
      expect(afterMap.get(memberContribUser)).toMatchObject({
        is_active: true,
        role: 'contributor',
      });
      expect(afterMap.get(formerMemberUser)).toMatchObject({
        is_active: true,
        role: 'contributor',
      });

      // Check AC-14: exactly 4 history rows with workspace_role_applied
      const historyRows = await migrationsDs.query<
        {
          member_id: string;
          from_role: string;
          to_role: string | null;
          actor_id: string | null;
          request_id: string;
        }[]
      >(
        `SELECT member_id, from_role, to_role, actor_id, request_id FROM project_member_role_history
         WHERE project_id = $1 AND change_type = 'workspace_role_applied'`,
        [pId],
      );
      expect(historyRows).toHaveLength(4);
      const hMap = new Map(historyRows.map((h) => [h.member_id, h]));
      expect(hMap.get(adminUser)).toMatchObject({
        from_role: 'admin',
        to_role: null,
        actor_id: null,
        request_id: 'migration:ApplyProjectAccessPolicies',
      });
      expect(hMap.get(formerAdminUser)).toMatchObject({
        from_role: 'admin',
        to_role: null,
        actor_id: null,
        request_id: 'migration:ApplyProjectAccessPolicies',
      });
      expect(hMap.get(guestUser)).toMatchObject({
        from_role: 'contributor',
        to_role: 'viewer',
        actor_id: null,
        request_id: 'migration:ApplyProjectAccessPolicies',
      });
      expect(hMap.get(memberViewUser)).toMatchObject({
        from_role: 'viewer',
        to_role: 'commenter',
        actor_id: null,
        request_id: 'migration:ApplyProjectAccessPolicies',
      });

      // 4. Test AC-15: down() reverts all changes and deletes history rows
      await migrationsDs.undoLastMigration({ transaction: 'each' });
      await migrationsDs.undoLastMigration({ transaction: 'each' });
      await migrationsDs.undoLastMigration({ transaction: 'each' });

      const rowsAfterDown = await migrationsDs.query<
        { member_id: string; role: string; is_active: boolean }[]
      >(
        `SELECT member_id, role, is_active FROM project_members WHERE project_id = $1`,
        [pId],
      );
      const downMap = new Map(rowsAfterDown.map((r) => [r.member_id, r]));
      expect(downMap.get(adminUser)).toMatchObject({
        is_active: true,
        role: 'admin',
      });
      expect(downMap.get(formerAdminUser)).toMatchObject({
        is_active: true,
        role: 'admin',
      });
      expect(downMap.get(guestUser)).toMatchObject({
        is_active: true,
        role: 'contributor',
      });
      expect(downMap.get(memberViewUser)).toMatchObject({
        is_active: true,
        role: 'viewer',
      });
      expect(downMap.get(memberContribUser)).toMatchObject({
        is_active: true,
        role: 'contributor',
      });
      expect(downMap.get(formerMemberUser)).toMatchObject({
        is_active: true,
        role: 'contributor',
      });

      const historyAfterDown = await migrationsDs.query(
        `SELECT 1 FROM project_member_role_history WHERE project_id = $1 AND change_type = 'workspace_role_applied'`,
        [pId],
      );
      expect(historyAfterDown).toHaveLength(0);

      const schemaAfterDown = await schemaSnapshot(migrationsDs);
      expect(schemaAfterDown).toEqual(schemaBeforeUp);
    } finally {
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
  });

  it('AddProjectRoleChangedHistory down() refuses when role_changed rows exist and succeeds when clean', async () => {
    const ownerId = await createUser(e2e, 'owner-cpr-mig@openplany.dev', {
      is_superuser: true,
    });
    const memberUser = await createUser(e2e, 'target-cpr-mig@openplany.dev');
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'owner-cpr-mig@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'WS Mig CPR',
        slug: 'ws-mig-cpr',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, identifier, name, icon_name, icon_color, cover_key, created_by_id)
       VALUES ($1, 'PRJMC', 'Project Mig CPR', 'square-check', '#868E96', 'cover-01', $2) RETURNING id`,
      [wsId, ownerId],
    );
    const pId = project!.id;

    await migrationsDs.query(
      `INSERT INTO project_member_role_history (
        workspace_id, project_id, member_id, role_scope, from_role, to_role, change_type, actor_id, request_id
      ) VALUES ($1, $2, $3, 'project', 'commenter', 'contributor', 'role_changed', $4, 'req-mig-test')`,
      [wsId, pId, memberUser, ownerId],
    );

    // Revert EnableUnaccent so AddProjectRoleChangedHistory is the last applied migration
    await migrationsDs.undoLastMigration({ transaction: 'each' });

    try {
      await expect(
        migrationsDs.undoLastMigration({ transaction: 'each' }),
      ).rejects.toThrow(
        /Cannot revert AddProjectRoleChangedHistory: 1 project role history rows use change_type 'role_changed'/,
      );

      await migrationsDs.query(
        `DELETE FROM project_member_role_history WHERE change_type = 'role_changed' AND member_id = $1`,
        [memberUser],
      );

      await migrationsDs.undoLastMigration({ transaction: 'each' });

      await migrationsDs.runMigrations({ transaction: 'each' });
    } finally {
      await migrationsDs.query(
        `DELETE FROM project_member_role_history WHERE change_type = 'role_changed' AND member_id = $1`,
        [memberUser],
      );
      await migrationsDs.runMigrations({ transaction: 'each' });
    }
  });

  it('EnableUnaccent: rejects when extension is unavailable and supports up/down round-trip (DB B2)', async () => {
    // Unit pre-check test: throws specific error if unaccent is not available in pg_available_extensions
    const fakeQueryRunner = {
      query: vi.fn().mockResolvedValue([]),
    };
    const migration = new EnableUnaccent1791610400000();
    await expect(
      migration.up(fakeQueryRunner as unknown as import('typeorm').QueryRunner),
    ).rejects.toThrow(
      'PostgreSQL extension `unaccent` is not available. Install the postgresql-contrib package (or enable `unaccent` on your managed database) and run the migrations again.',
    );

    // Live round-trip on database
    await migrationsDs.undoLastMigration({ transaction: 'each' });
    const droppedExt = await migrationsDs.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'unaccent'`,
    );
    expect(droppedExt).toHaveLength(0);

    await migrationsDs.runMigrations({ transaction: 'each' });
    const createdExt = await migrationsDs.query(
      `SELECT 1 FROM pg_extension WHERE extname = 'unaccent'`,
    );
    expect(createdExt).toHaveLength(1);
  });
});

