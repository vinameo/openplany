import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { DataSource } from 'typeorm';
import { CreateAuthTables1791379542810 } from '../src/database/migrations/1791379542810-CreateAuthTables.js';
import { CreateWorkspaceTables1791465600000 } from '../src/database/migrations/1791465600000-CreateWorkspaceTables.js';
import { AddUsersCreatedBy1791534730151 } from '../src/database/migrations/1791534730151-AddUsersCreatedBy.js';
import { CreateWorkspaceMemberRoleHistory1791550147414 } from '../src/database/migrations/1791550147414-CreateWorkspaceMemberRoleHistory.js';
import { RemoveWorkspaceOwnerRole1791550200000 } from '../src/database/migrations/1791550200000-RemoveWorkspaceOwnerRole.js';
import { e2eEnv } from './e2eEnv.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

describe('RemoveWorkspaceOwnerRole (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  it('AC-37: inserting owner into workspace_members is rejected by role check constraint', async () => {
    const userRes = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone)
       VALUES ('owner-rej@openplany.dev', 'owner_rej', 'hash', 'A', 'B', 'A B', 'UTC')
       RETURNING id`,
    );
    const userId = userRes[0]!.id;

    const wsRes = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO workspaces (name, slug, organization_size, timezone, background_color, created_by_id)
       VALUES ('Reject Owner WS', 'reject-owner-ws', '2-10', 'UTC', '#000000', $1)
       RETURNING id`,
      [userId],
    );
    const wsId = wsRes[0]!.id;

    let error: { driverError?: { code?: string }; code?: string } | undefined;
    try {
      await e2e.dataSource.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role)
         VALUES ($1, $2, 'owner')`,
        [wsId, userId],
      );
    } catch (err) {
      error = err as { driverError?: { code?: string }; code?: string };
    }

    expect(error).toBeDefined();
    // 23514 (check_violation) or 23503 (foreign_key_violation after roles table FK is added)
    expect(['23514', '23503']).toContain(error?.driverError?.code || error?.code);
  });

  it('OR-5: owner_role_retired with invalid shape (e.g. to_role = member) is rejected by wmrh_shape_check', async () => {
    const userRes = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone)
       VALUES ('shape-rej@openplany.dev', 'shape_rej', 'hash', 'A', 'B', 'A B', 'UTC')
       RETURNING id`,
    );
    const userId = userRes[0]!.id;

    const wsRes = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO workspaces (name, slug, organization_size, timezone, background_color, created_by_id)
       VALUES ('Shape Test WS', 'shape-test-ws', '2-10', 'UTC', '#000000', $1)
       RETURNING id`,
      [userId],
    );
    const wsId = wsRes[0]!.id;

    let error: { driverError?: { code?: string }; code?: string } | undefined;
    try {
      await e2e.dataSource.query(
        `INSERT INTO workspace_member_role_history
           (workspace_id, member_id, from_role, to_role, change_type)
         VALUES ($1, $2, 'owner', 'member', 'owner_role_retired')`,
        [wsId, userId],
      );
    } catch (err) {
      error = err as { driverError?: { code?: string }; code?: string };
    }

    expect(error).toBeDefined();
    expect(error?.driverError?.code || error?.code).toBe('23514');
  });

  it('D23: multiple admins in the same workspace are allowed', async () => {
    const u1 = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone)
       VALUES ('admin1@openplany.dev', 'admin_1', 'hash', 'A', 'B', 'A B', 'UTC')
       RETURNING id`,
    );
    const u2 = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone)
       VALUES ('admin2@openplany.dev', 'admin_2', 'hash', 'A', 'B', 'A B', 'UTC')
       RETURNING id`,
    );

    const ws = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO workspaces (name, slug, organization_size, timezone, background_color, created_by_id)
       VALUES ('Two Admins WS', 'two-admins-ws', '2-10', 'UTC', '#000000', $1)
       RETURNING id`,
      [u1[0]!.id],
    );
    const wsId = ws[0]!.id;

    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role)
       VALUES ($1, $2, 'admin'), ($1, $3, 'admin')`,
      [wsId, u1[0]!.id, u2[0]!.id],
    );

    const admins = await e2e.dataSource.query<{ member_id: string }[]>(
      `SELECT member_id FROM workspace_members WHERE workspace_id = $1 AND role = 'admin'`,
      [wsId],
    );
    expect(admins).toHaveLength(2);
  });

  it('AC-39: legacy data migrates correctly and reverts cleanly in temporary database', async () => {
    const url = new URL(e2eEnv().DATABASE_URL);
    const database = url.pathname.slice(1);
    const tempDb = `${database}_owner_test`;

    const adminUrl = new URL(url);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
    await admin.initialize();

    try {
      await admin.query(`DROP DATABASE IF EXISTS ${tempDb}`);
      await admin.query(`CREATE DATABASE ${tempDb}`);
    } finally {
      await admin.destroy();
    }

    const tempUrl = new URL(url);
    tempUrl.pathname = `/${tempDb}`;

    const batch1Migrations = [
      CreateAuthTables1791379542810,
      CreateWorkspaceTables1791465600000,
      AddUsersCreatedBy1791534730151,
      CreateWorkspaceMemberRoleHistory1791550147414,
    ];

    const tempDs = new DataSource({
      type: 'postgres',
      url: tempUrl.toString(),
      migrations: batch1Migrations,
      migrationsTableName: 'typeorm_migrations',
    });
    await tempDs.initialize();

    try {
      // 1. Run batch 1 migrations
      await tempDs.runMigrations();

      // 2. Insert test data: 2 users, 2 workspaces with Owner (1 active, 1 inactive owner) + 1 member
      const uRes = await tempDs.query<{ id: string }[]>(
        `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone)
         VALUES
           ('u1@test.com', 'u1', 'h', 'U', 'One', 'U One', 'UTC'),
           ('u2@test.com', 'u2', 'h', 'U', 'Two', 'U Two', 'UTC'),
           ('u3@test.com', 'u3', 'h', 'U', 'Three', 'U Three', 'UTC')
         RETURNING id`,
      );
      const [u1, u2, u3] = uRes.map((r) => r.id);

      const w1 = await tempDs.query<{ id: string }[]>(
        `INSERT INTO workspaces (name, slug, owner_id, created_by_id, organization_size, timezone, background_color)
         VALUES ('WS 1', 'ws-1', $1, $1, '2-10', 'UTC', '#000000') RETURNING id`,
        [u1],
      );
      const w2 = await tempDs.query<{ id: string }[]>(
        `INSERT INTO workspaces (name, slug, owner_id, created_by_id, organization_size, timezone, background_color)
         VALUES ('WS 2', 'ws-2', $1, $1, '2-10', 'UTC', '#000000') RETURNING id`,
        [u2],
      );

      // Members:
      // w1 has active owner u1, and active member u3
      // w2 has inactive owner u2
      await tempDs.query(
        `INSERT INTO workspace_members (workspace_id, member_id, role, is_active)
         VALUES
           ($1, $2, 'owner', true),
           ($1, $3, 'member', true),
           ($4, $5, 'owner', false)`,
        [w1[0]!.id, u1, u3, w2[0]!.id, u2],
      );

      // Backfill history exists for active members from migration 4
      await tempDs.query(
        `INSERT INTO workspace_member_role_history
           (workspace_id, member_id, from_role, to_role, change_type)
         VALUES
           ($1, $2, NULL, 'owner', 'backfill'),
           ($1, $3, NULL, 'member', 'backfill')`,
        [w1[0]!.id, u1, u3],
      );

      // 3. Now run RemoveWorkspaceOwnerRole migration
      const runner = tempDs.createQueryRunner();
      const migration = new RemoveWorkspaceOwnerRole1791550200000();
      await migration.up(runner);
      await runner.release();

      // Check results:
      // Active owner u1 becomes admin
      // Inactive owner u2 also becomes admin
      const memberRoles = await tempDs.query<{ member_id: string; role: string; is_active: boolean }[]>(
        `SELECT member_id, role, is_active FROM workspace_members ORDER BY CASE member_id WHEN '${u1}' THEN 1 WHEN '${u2}' THEN 2 WHEN '${u3}' THEN 3 END`,
      );
      expect(memberRoles).toEqual([
        { member_id: u1, role: 'admin', is_active: true },
        { member_id: u2, role: 'admin', is_active: false },
        { member_id: u3, role: 'member', is_active: true },
      ]);

      // Exactly 1 owner_role_retired entry (only for active owner u1)
      const retiredHistory = await tempDs.query<{ member_id: string; change_type: string }[]>(
        `SELECT member_id, change_type FROM workspace_member_role_history WHERE change_type = 'owner_role_retired'`,
      );
      expect(retiredHistory).toHaveLength(1);
      expect(retiredHistory[0]!.member_id).toBe(u1);

      // Column owner_id dropped from workspaces
      const columns = await tempDs.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'owner_id'`,
      );
      expect(columns).toHaveLength(0);

      // 4. Test revert (down)
      const runnerDown = tempDs.createQueryRunner();
      await migration.down(runnerDown);
      await runnerDown.release();

      // owner_id is back
      const columnsAfterDown = await tempDs.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'workspaces' AND column_name = 'owner_id'`,
      );
      expect(columnsAfterDown).toHaveLength(1);

      // u1 is owner again
      const restoredMembers = await tempDs.query<{ member_id: string; role: string }[]>(
        `SELECT member_id, role FROM workspace_members WHERE member_id = $1`,
        [u1],
      );
      expect(restoredMembers[0]!.role).toBe('owner');
    } finally {
      await tempDs.destroy();

      const adminClean = new DataSource({ type: 'postgres', url: adminUrl.toString() });
      await adminClean.initialize();
      try {
        await adminClean.query(`DROP DATABASE IF EXISTS ${tempDb}`);
      } finally {
        await adminClean.destroy();
      }
    }
  });
});

