import type { RoleResponse } from '@repo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import {
  AddPermissionLabel1791550400000,
  PERMISSION_LABELS,
} from '../src/database/migrations/1791550400000-AddPermissionLabel.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const DEFAULT_PASSWORD = 'Secret123!';

describe('Admin Roles & Role Permissions (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(DEFAULT_PASSWORD);
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function createDbUser(email: string, isSuperuser = false): Promise<string> {
    const rows = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (
        email, username, password, first_name, last_name, display_name,
        is_superuser, is_staff, is_email_verified,
        is_password_autoset, is_password_reset_required, is_password_expired,
        date_joined, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Test', 'User', 'Test User',
        $4, $4, true,
        false, false, false,
        now(), now(), now()
      )
      RETURNING id`,
      [email.toLowerCase(), email.toLowerCase().replace(/[^a-z0-9]/g, ''), passwordHash, isSuperuser],
    );
    return rows[0]!.id;
  }

  async function signInCookie(email: string): Promise<string> {
    const response = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((val) => val.startsWith('op_session='));
    if (!cookie) throw new Error('No session cookie found');
    return cookie.split(';')[0]!;
  }

  describe('GET /api/admin/roles', () => {
    it('returns 401 UNAUTHENTICATED when unauthenticated', async () => {
      await http().get('/api/admin/roles').expect(401);
    });

    it('returns 403 FORBIDDEN for non-instance admin', async () => {
      await createDbUser('member@openplany.dev', false);
      const cookie = await signInCookie('member@openplany.dev');
      await http().get('/api/admin/roles').set('Cookie', cookie).expect(403);
    });

    it('returns 200 with 7 roles and Cache-Control: no-store for instance admin', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      const res = await http()
        .get('/api/admin/roles')
        .set('Cookie', cookie)
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.roles).toHaveLength(7);

      const wsAdmin = res.body.roles.find(
        (r: RoleResponse) => r.scope === 'workspace' && r.key === 'admin',
      );
      expect(wsAdmin).toBeDefined();
      expect(wsAdmin?.locked).toBe(true);
      expect(wsAdmin?.version).toBe(1);
      expect(wsAdmin?.permissions).toContain('workspace.settings.update');

      const wsMember = res.body.roles.find(
        (r: RoleResponse) => r.scope === 'workspace' && r.key === 'member',
      );
      expect(wsMember).toBeDefined();
      expect(wsMember?.locked).toBe(false);

      const projAdmin = res.body.roles.find(
        (r: RoleResponse) => r.scope === 'project' && r.key === 'admin',
      );
      expect(projAdmin).toBeDefined();
      expect(projAdmin?.locked).toBe(true);

      expect(res.body.permissions).toHaveLength(57);
      expect(res.body.permissions[0]).toEqual(
        expect.objectContaining({
          key: expect.any(String),
          scope: expect.any(String),
          label: expect.any(String),
        }),
      );
      const wsSettingsView = res.body.permissions.find(
        (p: { key: string }) => p.key === 'workspace.settings.view',
      );
      expect(wsSettingsView).toEqual({
        key: 'workspace.settings.view',
        scope: 'workspace',
        label: 'View workspace settings',
      });
    });
  });

  describe('PATCH /api/admin/role-permissions', () => {
    it('returns 401 UNAUTHENTICATED when unauthenticated', async () => {
      await http()
        .patch('/api/admin/role-permissions')
        .set('Origin', ORIGIN)
        .send({ changes: [] })
        .expect(401);
    });

    it('returns 403 FORBIDDEN for non-instance admin', async () => {
      await createDbUser('member@openplany.dev', false);
      const cookie = await signInCookie('member@openplany.dev');
      await http()
        .patch('/api/admin/role-permissions')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ changes: [] })
        .expect(403);
    });

    it('returns 400 with fields on guardrail violation', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // Attempt G2 violation: modify locked workspace admin
      const res = await http()
        .patch('/api/admin/role-permissions')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          changes: [
            {
              scope: 'workspace',
              key: 'admin',
              version: 1,
              permissions: ['workspace.settings.view'],
            },
          ],
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields['workspace.admin:workspace.delete']).toBe(
        "This role always has its default permissions and can't be changed",
      );
    });

    it('returns 409 conflict when version is outdated', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      const res = await http()
        .patch('/api/admin/role-permissions')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          changes: [
            {
              scope: 'workspace',
              key: 'member',
              version: 999,
              permissions: ['workspace.settings.view'],
            },
          ],
        })
        .expect(409);

      expect(res.body.code).toBe('ROLE_PERMISSIONS_CHANGED');
    });

    it('applies valid changes, logs history, bumps version, and returns updated roles', async () => {
      const adminId = await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      const res = await http()
        .patch('/api/admin/role-permissions')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          changes: [
            {
              scope: 'workspace',
              key: 'member',
              version: 1,
              permissions: [
                'workspace.settings.view',
                'workspace.members.view',
                'workspace.projects.browse',
                'workspace.settings.update',
              ],
            },
          ],
        })
        .expect(200);

      const member = res.body.roles.find(
        (r: RoleResponse) => r.scope === 'workspace' && r.key === 'member',
      );
      expect(member).toBeDefined();
      expect(member?.version).toBe(2);
      expect(member?.permissions).toContain('workspace.settings.update');

      expect(res.body.permissions).toHaveLength(57);

      const history = await e2e.dataSource.query<
        {
          scope: string;
          role_key: string;
          permission_key: string;
          change_type: string;
          actor_id: string;
          request_id: string;
        }[]
      >(
        "SELECT scope, role_key, permission_key, change_type, actor_id, request_id FROM role_permission_history WHERE change_type <> 'seeded' ORDER BY id DESC",
      );

      expect(history).toHaveLength(1);
      expect(history[0]!.scope).toBe('workspace');
      expect(history[0]!.role_key).toBe('member');
      expect(history[0]!.permission_key).toBe('workspace.settings.update');
      expect(history[0]!.change_type).toBe('granted');
      expect(history[0]!.actor_id).toBe(adminId);
      expect(history[0]!.request_id).toBeDefined();
    });
  });

  describe('Migration: AddPermissionLabel1791550400000', () => {
    it('creates column label as varchar(200) NOT NULL in PostgreSQL', async () => {
      const columns = await e2e.dataSource.query<
        {
          column_name: string;
          data_type: string;
          character_maximum_length: number;
          is_nullable: string;
        }[]
      >(
        `SELECT column_name, data_type, character_maximum_length, is_nullable
         FROM information_schema.columns
         WHERE table_name = 'permissions' AND column_name = 'label'`,
      );

      expect(columns).toHaveLength(1);
      expect(columns[0]!.data_type).toBe('character varying');
      expect(columns[0]!.character_maximum_length).toBe(200);
      expect(columns[0]!.is_nullable).toBe('NO');
    });

    it('populates all 57 permissions with exact labels in dev DB', async () => {
      const rows = await e2e.dataSource.query<
        { key: string; scope: string; label: string }[]
      >('SELECT key, scope, label FROM permissions ORDER BY key');

      expect(rows).toHaveLength(57);
      for (const row of rows) {
        expect(PERMISSION_LABELS[row.key]).toBeDefined();
        expect(row.label).toBe(PERMISSION_LABELS[row.key]);
      }
    });

    it('reverts cleanly with down() and restores with up()', async () => {
      const migration = new AddPermissionLabel1791550400000();

      // 1. Revert down
      const runnerDown = e2e.dataSource.createQueryRunner();
      await runnerDown.connect();
      await runnerDown.startTransaction();
      try {
        await migration.down(runnerDown);
        await runnerDown.commitTransaction();
      } catch (err) {
        await runnerDown.rollbackTransaction();
        throw err;
      } finally {
        await runnerDown.release();
      }

      // Column label is dropped
      const columnsAfterDown = await e2e.dataSource.query<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'permissions' AND column_name = 'label'`,
      );
      expect(columnsAfterDown).toHaveLength(0);

      // 2. Re-apply up
      const runnerUp = e2e.dataSource.createQueryRunner();
      await runnerUp.connect();
      await runnerUp.startTransaction();
      try {
        await migration.up(runnerUp);
        await runnerUp.commitTransaction();
      } catch (err) {
        await runnerUp.rollbackTransaction();
        throw err;
      } finally {
        await runnerUp.release();
      }

      // Column label is back as NOT NULL
      const columnsAfterUp = await e2e.dataSource.query<
        { column_name: string; is_nullable: string }[]
      >(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_name = 'permissions' AND column_name = 'label'`,
      );
      expect(columnsAfterUp).toHaveLength(1);
      expect(columnsAfterUp[0]!.is_nullable).toBe('NO');

      // All 57 permissions are re-populated with correct labels
      const rowsAfterUp = await e2e.dataSource.query<
        { key: string; label: string }[]
      >('SELECT key, label FROM permissions ORDER BY key');
      expect(rowsAfterUp).toHaveLength(57);
      for (const row of rowsAfterUp) {
        expect(row.label).toBe(PERMISSION_LABELS[row.key]);
      }
    });
  });
});

