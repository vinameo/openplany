import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Secret123!';

describe('WorkspaceRoleHistory (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function createUser(email: string): Promise<string> {
    const result = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone, is_superuser)
       VALUES ($1, $1, $2, 'Test', 'User', 'Test User', 'UTC', true)
       RETURNING id`,
      [email, passwordHash],
    );
    return result[0]!.id;
  }

  async function signInCookie(email: string): Promise<string> {
    const response = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((val) => val.startsWith('op_session='));
    if (!cookie) throw new Error('No session cookie found');
    return cookie.split(';')[0]!;
  }

  it('AC-14: database contains the 3 CHECK constraints, the role trigger and 2 indexes with correct names', async () => {
    const constraints = await e2e.dataSource.query<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint
       WHERE conrelid = 'workspace_member_role_history'::regclass AND contype = 'c'`,
    );
    const conNames = constraints.map((c) => c.conname);

    // Role names are no longer listed in CHECKs; the trigger checks them against roles (B14).
    expect(conNames.sort()).toEqual([
      'wmrh_change_check',
      'wmrh_change_type_check',
      'wmrh_shape_check',
    ]);

    const triggers = await e2e.dataSource.query<{ tgname: string }[]>(
      `SELECT tgname FROM pg_trigger
       WHERE tgrelid = 'workspace_member_role_history'::regclass AND NOT tgisinternal`,
    );
    expect(triggers.map((t) => t.tgname)).toEqual(['wmrh_validate_row']);

    const indexes = await e2e.dataSource.query<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'workspace_member_role_history'`,
    );
    const indexNames = indexes.map((i) => i.indexname);

    expect(indexNames).toContain('idx_wmrh_workspace_created_at');
    expect(indexNames).toContain('idx_wmrh_workspace_member_created_at');
  });

  it('AC-15: POST /api/workspaces records exactly one workspace_created entry in role history with matching request_id and created_at', async () => {
    const userId = await createUser('history-creator@openplany.dev');
    const cookie = await signInCookie('history-creator@openplany.dev');

    const requestId = 'e2e-role-history-1';
    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('X-Request-Id', requestId)
      .send({
        name: 'History Workspace',
        slug: 'history-workspace',
        organizationSize: '2-10',
      })
      .expect(201);

    const workspaceId = res.body.id as string;

    const historyRows = await e2e.dataSource.query<
      {
        workspace_id: string;
        member_id: string;
        from_role: string | null;
        to_role: string | null;
        change_type: string;
        actor_id: string | null;
        request_id: string | null;
        created_at: Date;
      }[]
    >(
      `SELECT workspace_id, member_id, from_role, to_role, change_type, actor_id, request_id, created_at
       FROM workspace_member_role_history WHERE workspace_id = $1`,
      [workspaceId],
    );

    expect(historyRows).toHaveLength(1);
    const row = historyRows[0]!;
    expect(row.workspace_id).toBe(workspaceId);
    expect(row.member_id).toBe(userId);
    expect(row.from_role).toBeNull();
    expect(row.to_role).toBe('admin');
    expect(row.change_type).toBe('workspace_created');
    expect(row.actor_id).toBe(userId);
    expect(row.request_id).toBe(requestId);

    const memberRows = await e2e.dataSource.query<{ created_at: Date }[]>(
      'SELECT created_at FROM workspace_members WHERE workspace_id = $1 AND member_id = $2',
      [workspaceId, userId],
    );
    expect(memberRows).toHaveLength(1);
    expect(new Date(row.created_at).getTime()).toBe(
      new Date(memberRows[0]!.created_at).getTime(),
    );
  });

  it('AC-16: if history insertion fails, the entire transaction rolls back and workspace is not created', async () => {
    const userId = await createUser('history-rollback@openplany.dev');
    const cookie = await signInCookie('history-rollback@openplany.dev');

    // Add temporary blocking constraint
    await e2e.dataSource.query(
      `ALTER TABLE workspace_member_role_history ADD CONSTRAINT e2e_block CHECK (false) NOT VALID`,
    );

    try {
      const res = await http()
        .post('/api/workspaces')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Should Rollback',
          slug: 'should-rollback',
          organizationSize: 'Just myself',
        });

      expect(res.status).toBe(500);

      // Verify no workspace was created
      const ws = await e2e.dataSource.query(
        'SELECT id FROM workspaces WHERE slug = $1',
        ['should-rollback'],
      );
      expect(ws).toHaveLength(0);

      // Verify no members created
      const members = await e2e.dataSource.query(
        'SELECT * FROM workspace_members WHERE member_id = $1',
        [userId],
      );
      expect(members).toHaveLength(0);

      // Verify last_workspace_id did not change
      const user = await e2e.dataSource.query<
        { last_workspace_id: string | null }[]
      >('SELECT last_workspace_id FROM users WHERE id = $1', [userId]);
      expect(user[0]!.last_workspace_id).toBeNull();
    } finally {
      await e2e.dataSource.query(
        `ALTER TABLE workspace_member_role_history DROP CONSTRAINT IF EXISTS e2e_block`,
      );
    }
  });

  it('DB-F1: stores full 128-character request_id in workspace_member_role_history', async () => {
    await createUser('history-128@openplany.dev');
    const cookie = await signInCookie('history-128@openplany.dev');

    const longRequestId = 'req-' + 'a'.repeat(124); // exactly 128 chars
    expect(longRequestId.length).toBe(128);

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('X-Request-Id', longRequestId)
      .send({
        name: 'Long Request ID WS',
        slug: 'long-req-id-ws',
        organizationSize: 'Just myself',
      })
      .expect(201);

    const history = await e2e.dataSource.query<{ request_id: string }[]>(
      'SELECT request_id FROM workspace_member_role_history WHERE workspace_id = $1',
      [res.body.id],
    );
    expect(history[0]!.request_id).toBe(longRequestId);
  });

  describe('AC-17: rejects invalid row shapes directly inserted via 23514 constraint errors', () => {
    let workspaceId: string;
    let userId: string;

    beforeEach(async () => {
      userId = await createUser('shape-check@openplany.dev');
      const wsResult = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO workspaces (name, slug, created_by_id, updated_by_id, organization_size, timezone, background_color)
         VALUES ('Test WS', 'test-ws-shape', $1, $1, '2-10', 'UTC', '#0F172A')
         RETURNING id`,
        [userId],
      );
      workspaceId = wsResult[0]!.id;
    });

    async function expectConstraintViolation(
      fromRole: string | null,
      toRole: string | null,
      changeType: string,
      expectedConstraint: string,
    ): Promise<void> {
      try {
        await e2e.dataSource.query(
          `INSERT INTO workspace_member_role_history
            (workspace_id, member_id, from_role, to_role, change_type, actor_id)
           VALUES ($1, $2, $3, $4, $5, $2)`,
          [workspaceId, userId, fromRole, toRole, changeType],
        );
        expect.unreachable('Should have thrown constraint violation');
      } catch (err: unknown) {
        const pgErr = err as { code?: string; message?: string };
        expect(pgErr.code).toBe('23514');
        expect(pgErr.message).toContain(expectedConstraint);
      }
    }

    it('rejects invalid from_role via wmrh_from_role_check', async () => {
      await expectConstraintViolation(
        'superadmin',
        'admin',
        'role_changed',
        'wmrh_from_role_check',
      );
    });

    it('rejects invalid to_role via wmrh_to_role_check', async () => {
      await expectConstraintViolation(
        'admin',
        'superadmin',
        'role_changed',
        'wmrh_to_role_check',
      );
    });

    it('rejects invalid change_type via wmrh_change_type_check', async () => {
      await expectConstraintViolation(
        'admin',
        'member',
        'invalid_type',
        'wmrh_change_type_check',
      );
    });

    it('rejects from_role = to_role via wmrh_change_check', async () => {
      await expectConstraintViolation(
        'admin',
        'admin',
        'role_changed',
        'wmrh_change_check',
      );
    });

    it('rejects role_changed to the retired owner role via wmrh_to_role_check', async () => {
      await expectConstraintViolation(
        'admin',
        'owner',
        'role_changed',
        'wmrh_to_role_check',
      );
    });

    it('rejects role_changed from the retired owner role via wmrh_from_role_check', async () => {
      await expectConstraintViolation(
        'owner',
        'admin',
        'role_changed',
        'wmrh_from_role_check',
      );
    });

    it('rejects role_changed missing from_role via wmrh_shape_check', async () => {
      await expectConstraintViolation(
        null,
        'admin',
        'role_changed',
        'wmrh_shape_check',
      );
    });

    it('rejects member_removed with non-null to_role via wmrh_shape_check', async () => {
      await expectConstraintViolation(
        'member',
        'admin',
        'member_removed',
        'wmrh_shape_check',
      );
    });

    it('rejects member_removed from the retired owner role via wmrh_from_role_check', async () => {
      await expectConstraintViolation(
        'owner',
        null,
        'member_removed',
        'wmrh_from_role_check',
      );
    });

    it('rejects workspace_created with a from_role via wmrh_shape_check', async () => {
      await expectConstraintViolation(
        'member',
        'admin',
        'workspace_created',
        'wmrh_shape_check',
      );
    });

    it('rejects new ownership_transferred rows via wmrh_legacy_change_type_check', async () => {
      await expectConstraintViolation(
        'member',
        'admin',
        'ownership_transferred',
        'wmrh_legacy_change_type_check',
      );
    });

    it('rejects new owner_role_retired rows via wmrh_legacy_change_type_check', async () => {
      await expectConstraintViolation(
        'owner',
        'admin',
        'owner_role_retired',
        'wmrh_legacy_change_type_check',
      );
    });

    it('accepts a role added to roles later without any schema change', async () => {
      const runner = e2e.dataSource.createQueryRunner();
      await runner.startTransaction();
      try {
        await runner.query(
          `INSERT INTO roles (scope, key) VALUES ('workspace', 'reviewer')`,
        );
        await runner.query(
          `INSERT INTO workspace_member_role_history
            (workspace_id, member_id, from_role, to_role, change_type, actor_id)
           VALUES ($1, $2, NULL, 'reviewer', 'member_added', $2)`,
          [workspaceId, userId],
        );
        const rows: { to_role: string }[] = await runner.query(
          `SELECT to_role FROM workspace_member_role_history WHERE workspace_id = $1`,
          [workspaceId],
        );
        expect(rows).toEqual([{ to_role: 'reviewer' }]);
      } finally {
        // Never leave the extra role behind for other tests.
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
  });
});
