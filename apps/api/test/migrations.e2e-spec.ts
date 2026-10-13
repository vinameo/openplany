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

/**
 * Migrations meet real data (CLAUDE.md §8 design pass): the newest migrations
 * are reverted one by one and re-applied over a database that holds the
 * awkward but legal rows production will have. After each down() the schema
 * must equal a fresh database built up to that version, and the final schema
 * must equal the start. A new migration is the newest one, so it is covered.
 */
const ROUNDTRIP_COUNT = 4;

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
  return { columns, indexes, constraints };
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
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role)
       VALUES ($1, $2, $3, 'admin')`,
      [active!.id, ws.id, ownerId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, is_active)
       VALUES ($1, $2, $3, 'contributor', false)`,
      [active!.id, ws.id, formerId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_member_role_history (workspace_id, project_id, member_id, from_role, to_role, change_type, actor_id)
       VALUES ($1, $2, $3, NULL, 'admin', 'project_created', $3)`,
      [ws.id, active!.id, ownerId],
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
    expect(members).toHaveLength(2);
    for (const m of members) {
      expect(m.joined_at).toEqual(m.created_at);
    }
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
});
