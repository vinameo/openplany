import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DEFAULT_PRIORITIES } from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';

describe('WorkItemPriorities Database Constraints and Trigger (e2e)', () => {
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

  it('preserves exactly 5 default rows with identical IDs across e2e.reset() (AC-15, RQ D19, DB B5)', async () => {
    const beforeDefaults = await e2e.dataSource.query<
      { id: string; default_key: string; name: string }[]
    >(
      `SELECT id, default_key, name FROM work_item_priorities WHERE level = 'default' ORDER BY default_key`,
    );
    expect(beforeDefaults).toHaveLength(5);

    // Call reset()
    await e2e.reset();

    const afterDefaults = await e2e.dataSource.query<
      { id: string; default_key: string; name: string }[]
    >(
      `SELECT id, default_key, name FROM work_item_priorities WHERE level = 'default' ORDER BY default_key`,
    );
    expect(afterDefaults).toHaveLength(5);
    expect(afterDefaults).toEqual(beforeDefaults);
  });

  it('DB B2.4, RQ D31: 5 default rows in DB match DEFAULT_PRIORITIES', async () => {
    const defaults = await e2e.dataSource.query<
      {
        default_key: string;
        priority_band: string;
        color: string;
        name: string;
      }[]
    >(
      `SELECT default_key, priority_band, color, name FROM work_item_priorities WHERE level = 'default' ORDER BY default_key`,
    );
    expect(defaults).toHaveLength(5);

    for (const def of DEFAULT_PRIORITIES) {
      const match = defaults.find((p) => p.default_key === def.key);
      expect(match).toBeDefined();
      expect(match!.priority_band).toBe(def.band);
      expect(match!.color).toBe(def.color);
    }
  });

  it('AC-13: trigger rejects modifying, deleting, or inserting default level rows', async () => {
    // 1. Rejects UPDATE on default row
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_priorities SET name = 'Modified' WHERE default_key = 'none'`,
      ),
    ).rejects.toThrow(/cannot modify default level row/);

    // 2. Rejects DELETE on default row
    await expect(
      e2e.dataSource.query(
        `DELETE FROM work_item_priorities WHERE default_key = 'none'`,
      ),
    ).rejects.toThrow(/cannot delete default level row/);

    // 3. Rejects INSERT with level = 'default'
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, default_key, name, priority_band, color, created_at, updated_at)
         VALUES
          ('default', 'custom_default', 'Custom', 'medium', '#E08A1E', now(), now())`,
      ),
    ).rejects.toThrow(/cannot insert default level row/);
  });

  it('AC-13: trigger rejects changing level, workspace_id, or project_id of existing rows', async () => {
    await createUser(e2e, 'trigger-prio-test@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'trigger-prio-test@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'Trig Prio WS',
        slug: 'trig-prio-ws',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'Trig Prio Project', 'TPP', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );

    const [priority] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities
        (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES
        ('project', $1, $2, 'Special Priority', 'high', '#D0642B', now(), now()) RETURNING id`,
      [wsId, project!.id],
    );

    // Attempt to change level
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_priorities SET level = 'workspace' WHERE id = $1`,
        [priority!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);

    // Attempt to change workspace_id
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_priorities SET workspace_id = gen_random_uuid() WHERE id = $1`,
        [priority!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);

    // Attempt to change project_id
    await expect(
      e2e.dataSource.query(
        `UPDATE work_item_priorities SET project_id = gen_random_uuid() WHERE id = $1`,
        [priority!.id],
      ),
    ).rejects.toThrow(/cannot change level, workspace_id, or project_id/);
  });

  it('AC-14: rejects rows violating work_item_priorities_level_shape_check constraint', async () => {
    // 1. level = 'project' without workspace_id
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, project_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('project', gen_random_uuid(), 'Invalid Project Priority', 'medium', '#E08A1E', now(), now())`,
      ),
    ).rejects.toThrow(/work_item_priorities_level_shape_check/);

    // 2. level = 'workspace' with project_id
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('workspace', gen_random_uuid(), gen_random_uuid(), 'Invalid WS Priority', 'medium', '#E08A1E', now(), now())`,
      ),
    ).rejects.toThrow(/work_item_priorities_level_shape_check/);
  });

  it('AC-14: rejects rows violating band and color CHECK constraints', async () => {
    await createUser(e2e, 'constraints-prio@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'constraints-prio@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({ name: 'Check WS', slug: 'check-ws', organizationSize: '2-10' })
      .expect(201);
    const wsId = created.body.id as string;

    // 1. Invalid band (e.g. 'critical')
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('workspace', $1, 'Critical Band', 'critical', '#B05A5A', now(), now())`,
        [wsId],
      ),
    ).rejects.toThrow(/work_item_priorities_priority_band_check/);

    // 2. Invalid color (not matching ^#[0-9A-F]{6}$)
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('workspace', $1, 'Bad Color', 'urgent', 'red', now(), now())`,
        [wsId],
      ),
    ).rejects.toThrow(/work_item_priorities_color_check/);

    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('workspace', $1, 'Bad Hex', 'urgent', '#12345', now(), now())`,
        [wsId],
      ),
    ).rejects.toThrow(/work_item_priorities_color_check/);
  });

  it('AC-14: rejects duplicate live name within same workspace level, but permits when first row is soft-deleted', async () => {
    await createUser(e2e, 'ws-name-key@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'ws-name-key@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'WS Name WS',
        slug: 'ws-name-ws',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;

    // 1. Insert first row
    const [first] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities
        (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES
        ('workspace', $1, 'Blocker', 'urgent', '#B05A5A', now(), now()) RETURNING id`,
      [wsId],
    );

    // 2. Duplicate case-insensitive name rejected
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('workspace', $1, 'blocker', 'urgent', '#B05A5A', now(), now())`,
        [wsId],
      ),
    ).rejects.toThrow(/work_item_priorities_workspace_name_key/);

    // 3. Soft-delete first row
    await e2e.dataSource.query(
      `UPDATE work_item_priorities SET deleted_at = now() WHERE id = $1`,
      [first!.id],
    );

    // 4. Second row with same name now succeeds
    const [second] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities
        (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES
        ('workspace', $1, 'blocker', 'urgent', '#B05A5A', now(), now()) RETURNING id`,
      [wsId],
    );
    expect(second!.id).toBeDefined();
  });

  it('AC-14: rejects duplicate live name within same project level, but permits when first row is soft-deleted', async () => {
    await createUser(e2e, 'prj-name-key@openplany.dev', {
      is_superuser: true,
    });
    const created = await request(e2e.app.getHttpServer())
      .post('/api/workspaces')
      .set('Cookie', await signInCookie(e2e, 'prj-name-key@openplany.dev'))
      .set('Origin', DEFAULT_E2E_ORIGIN)
      .send({
        name: 'PRJ Name WS',
        slug: 'prj-name-ws',
        organizationSize: '2-10',
      })
      .expect(201);
    const wsId = created.body.id as string;
    const [project] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO projects (workspace_id, name, identifier, icon_name, icon_color, cover_key, timezone)
       VALUES ($1, 'PRJ Name Project', 'PNP', 'square-check', '#868E96', 'cover-01', 'UTC') RETURNING id`,
      [wsId],
    );

    // 1. Insert first row
    const [first] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities
        (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES
        ('project', $1, $2, 'Nice to Have', 'low', '#3E7BD6', now(), now()) RETURNING id`,
      [wsId, project!.id],
    );

    // 2. Duplicate case-insensitive name rejected
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_item_priorities
          (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
         VALUES
          ('project', $1, $2, 'nice to have', 'low', '#3E7BD6', now(), now())`,
        [wsId, project!.id],
      ),
    ).rejects.toThrow(/work_item_priorities_project_name_key/);

    // 3. Soft-delete first row
    await e2e.dataSource.query(
      `UPDATE work_item_priorities SET deleted_at = now() WHERE id = $1`,
      [first!.id],
    );

    // 4. Second row with same name now succeeds
    const [second] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities
        (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES
        ('project', $1, $2, 'nice to have', 'low', '#3E7BD6', now(), now()) RETURNING id`,
      [wsId, project!.id],
    );
    expect(second!.id).toBeDefined();
  });
});
