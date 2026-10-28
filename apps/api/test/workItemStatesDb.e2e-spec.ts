import { createE2eApp, type E2eApp } from './createE2eApp.js';
import { createUser, DEFAULT_E2E_ORIGIN, signInCookie } from './helpers/e2eUsers.js';
import request from 'supertest';

describe('WorkItemStates Database Constraints and Trigger (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  it('preserves exactly 5 default rows with identical IDs across e2e.reset() (RQ D33, R-08)', async () => {
    const beforeDefaults = await e2e.dataSource.query<
      { id: string; default_key: string; name: string }[]
    >(
      `SELECT id, default_key, name FROM work_item_states WHERE level = 'default' ORDER BY default_key`,
    );
    expect(beforeDefaults).toHaveLength(5);

    // Call reset()
    await e2e.reset();

    const afterDefaults = await e2e.dataSource.query<
      { id: string; default_key: string; name: string }[]
    >(
      `SELECT id, default_key, name FROM work_item_states WHERE level = 'default' ORDER BY default_key`,
    );
    expect(afterDefaults).toHaveLength(5);
    expect(afterDefaults).toEqual(beforeDefaults);
  });

  it('AC-31: trigger rejects modifying or deleting default level rows', async () => {
    // 1. Rejects UPDATE on default row
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_states SET name = 'Modified' WHERE default_key = 'backlog'`,
      ),
    ).rejects.toThrow(/cannot modify default level row/);

    // 2. Rejects DELETE on default row
    await expect(
      e2e.dataSource.query(
        `DELETE FROM work_item_states WHERE default_key = 'backlog'`,
      ),
    ).rejects.toThrow(/cannot delete default level row/);

    // 3. Rejects INSERT with level = 'default'
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_states
          (level, default_key, name, state_group, color, created_at, updated_at)
         VALUES
          ('default', 'custom_default', 'Custom', 'planned', '#5B6B82', now(), now())`,
      ),
    ).rejects.toThrow(/cannot insert default level row/);
  });

  it('AC-31: trigger rejects changing level, workspace_id, or project_id of existing rows', async () => {
    await createUser(e2e, 'trigger-test@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'trigger-test@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({ name: 'Trig WS', slug: 'trig-ws', organizationSize: '2-10' })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Trig Project', 'TRP', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );

    const [state] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_states
        (level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
       VALUES
        ('project', $1, $2, 'In Review', 'active', '#E08A1E', now(), now()) RETURNING id`,
      [wsId, project!.id],
    );

    // Attempt to change level
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_states SET level = 'workspace' WHERE id = $1`,
        [state!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);

    // Attempt to change workspace_id
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_states SET workspace_id = gen_random_uuid() WHERE id = $1`,
        [state!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);

    // Attempt to change project_id
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_states SET project_id = gen_random_uuid() WHERE id = $1`,
        [state!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);
  });

  it('rejects rows violating work_item_states_level_shape_check constraint', async () => {
    // 1. level = 'project' without workspace_id
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_states
          (level, project_id, name, state_group, color, created_at, updated_at)
         VALUES
          ('project', gen_random_uuid(), 'Invalid Project', 'active', '#E08A1E', now(), now())`,
      ),
    ).rejects.toThrow(/work_item_states_level_shape_check/);

    // 2. level = 'workspace' with project_id
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_states
          (level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES
          ('workspace', gen_random_uuid(), gen_random_uuid(), 'Invalid WS', 'active', '#E08A1E', now(), now())`,
      ),
    ).rejects.toThrow(/work_item_states_level_shape_check/);
  });
});
