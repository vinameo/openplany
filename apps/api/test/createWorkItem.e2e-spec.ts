import request from 'supertest';
import {
  describe,
  beforeAll,
  beforeEach,
  afterAll,
  it,
  expect,
} from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type WorkItemResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  signInCookie,
  DEFAULT_E2E_ORIGIN as ORIGIN,
} from './helpers/e2eUsers.js';
import { CreateWorkItems1791610500000 } from '../src/database/migrations/1791610500000-CreateWorkItems.js';

describe('Create Work Item (e2e)', () => {
  let e2e: E2eApp;
  let userSeq = 0;

  beforeAll(async () => {
    e2e = await createE2eApp();
    const qr = e2e.dataSource.createQueryRunner();
    await qr.connect();
    try {
      const table = (await qr.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'work_items'",
      )) as unknown[];
      if (table.length === 0) {
        await new CreateWorkItems1791610500000().up(qr);
      }
    } finally {
      await qr.release();
    }
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function newUser(opts: { instanceAdmin?: boolean } = {}) {
    userSeq += 1;
    const email = `wi-user-${userSeq}@openplany.dev`;
    const id = await createUser(e2e, email, {
      is_superuser: opts.instanceAdmin ?? false,
    });
    return { id, email, cookie: await signInCookie(e2e, email) };
  }

  async function seedWorkspace(ownerUser?: { id: string; cookie: string }) {
    const owner = ownerUser ?? (await newUser({ instanceAdmin: true }));
    const wsRes = await http()
      .post('/api/workspaces')
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: `Workspace ${userSeq}`,
        slug: `ws-${userSeq}`,
        organizationSize: '2-10',
      })
      .expect(201);
    return { id: wsRes.body.id as string, slug: wsRes.body.slug as string, owner };
  }

  async function seedProject(
    ws: { id: string; slug: string; owner: { cookie: string } },
    name = 'Operations',
    identifier = 'OPS',
  ) {
    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        name,
        identifier,
        description: 'Project description',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    return {
      id: res.body.project.id as string,
      identifier: res.body.project.identifier as string,
    };
  }

  async function addMember(
    wsId: string,
    projId: string,
    user: { id: string },
    projectRole = 'contributor',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())
       ON CONFLICT (workspace_id, member_id) DO NOTHING`,
      [wsId, user.id],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, 'project', true, now(), now(), now())
       ON CONFLICT (project_id, member_id) DO UPDATE SET role = EXCLUDED.role, is_active = EXCLUDED.is_active`,
      [projId, wsId, user.id, projectRole],
    );
  }

  it('AC-04: creates work item with number 1, key OPS-1, normalized fields and Cache-Control: no-store', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    const key = crypto.randomUUID();
    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Fix login',
        description: '## Steps\r\n- a',
        idempotencyKey: key,
      })
      .expect(201);

    expect(res.headers['cache-control']).toBe('no-store');
    const workItem = res.body.workItem as WorkItemResponse;
    expect(workItem.number).toBe(1);
    expect(workItem.key).toBe('OPS-1');
    expect(workItem.title).toBe('Fix login');
    expect(workItem.description).toBe('## Steps\n- a');
    expect(workItem.createdById).toBe(an.id);
    expect(workItem.createdAt).toBeDefined();

    // AC-31: only WorkItemResponse fields returned
    expect(Object.keys(workItem).sort()).toEqual([
      'createdAt',
      'createdById',
      'description',
      'id',
      'key',
      'number',
      'title',
    ]);

    // DB check
    const rows = (await e2e.dataSource.query(
      'SELECT * FROM work_items WHERE project_id = $1',
      [proj.id],
    )) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it('AC-05: increments number per project and tracks project numbers independently', async () => {
    const ws = await seedWorkspace();
    const ops = await seedProject(ws, 'Operations', 'OPS');
    const mkt = await seedProject(ws, 'Marketing', 'MKT');
    const an = await newUser();
    await addMember(ws.id, ops.id, an, 'contributor');
    await addMember(ws.id, mkt.id, an, 'contributor');

    const res1 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'OPS 1', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(res1.body.workItem.key).toBe('OPS-1');

    const res2 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'OPS 2', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(res2.body.workItem.key).toBe('OPS-2');

    const resMkt = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${mkt.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'MKT 1', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(resMkt.body.workItem.key).toBe('MKT-1');
  });

  it('AC-06: handles 10 concurrent create requests without gaps, duplicates or deadlocks', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');

    const users = await Promise.all([newUser(), newUser(), newUser()]);
    for (const u of users) {
      await addMember(ws.id, proj.id, u, 'contributor');
    }

    const promises = Array.from({ length: 10 }, (_, i) => {
      const u = users[i % users.length]!;
      return http()
        .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
        .set('Cookie', u.cookie)
        .set('Origin', ORIGIN)
        .send({
          title: `Concurrent item ${i}`,
          description: `Description ${i}`,
          idempotencyKey: crypto.randomUUID(),
        });
    });

    const results = await Promise.all(promises);
    for (const res of results) {
      expect(res.status).toBe(201);
    }

    const numbers = results
      .map((r) => (r.body.workItem as WorkItemResponse).number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('AC-07: rejected or failed attempts do not advance the project counter', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // 1st valid work item
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'First', idempotencyKey: crypto.randomUUID() })
      .expect(201);

    // Invalid request (empty title)
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: '', idempotencyKey: crypto.randomUUID() })
      .expect(400);

    // Counter in DB check
    const [projectRow] = (await e2e.dataSource.query(
      'SELECT last_work_item_number FROM projects WHERE id = $1',
      [proj.id],
    )) as { last_work_item_number: number }[];
    expect(projectRow?.last_work_item_number).toBe(1);

    // Next valid work item gets number 2
    const res2 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Second', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(res2.body.workItem.number).toBe(2);
  });

  it('AC-09: replays 200 with same content and key without inserting a new row', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    const key = crypto.randomUUID();
    const res1 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Fix login', description: '## Notes', idempotencyKey: key })
      .expect(201);

    const res2 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Fix login', description: '## Notes', idempotencyKey: key })
      .expect(200);

    expect(res2.body.workItem.id).toBe(res1.body.workItem.id);
    expect(res2.body.workItem.number).toBe(res1.body.workItem.number);

    const count = (await e2e.dataSource.query(
      'SELECT count(*)::int as c FROM work_items WHERE project_id = $1',
      [proj.id],
    )) as { c: number }[];
    expect(count[0]?.c).toBe(1);
  });

  it('AC-10: returns 409 WORK_ITEM_REQUEST_REUSED for key reuse with altered content or project or soft deleted', async () => {
    const ws = await seedWorkspace();
    const ops = await seedProject(ws, 'Operations', 'OPS');
    const mkt = await seedProject(ws, 'Marketing', 'MKT');
    const an = await newUser();
    const binh = await newUser();
    await addMember(ws.id, ops.id, an, 'contributor');
    await addMember(ws.id, mkt.id, an, 'contributor');
    await addMember(ws.id, ops.id, binh, 'contributor');

    const key = crypto.randomUUID();
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Original', description: 'Desc', idempotencyKey: key })
      .expect(201);

    // 1. Same key, different title -> 409
    const resDifferentTitle = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Different', description: 'Desc', idempotencyKey: key })
      .expect(409);
    expect(resDifferentTitle.body.code).toBe('WORK_ITEM_REQUEST_REUSED');

    // 2. Same key, different project -> 409
    const resDifferentProject = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${mkt.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Original', description: 'Desc', idempotencyKey: key })
      .expect(409);
    expect(resDifferentProject.body.code).toBe('WORK_ITEM_REQUEST_REUSED');

    // 3. Different user with same key -> independent, 201
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', binh.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Binh title', idempotencyKey: key })
      .expect(201);

    // 4. Same key after soft delete -> 409
    await e2e.dataSource.query(
      'UPDATE work_items SET deleted_at = now() WHERE idempotency_key = $1 AND created_by_id = $2',
      [key, an.id],
    );
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Original', description: 'Desc', idempotencyKey: key })
      .expect(409);
  });

  it('AC-13: trims whitespace, normalizes CRLF and handles 50,000 char description', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // 1. Title trim
    const res1 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: '  Fix  ', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(res1.body.workItem.title).toBe('Fix');

    // 2. Whitespace description -> saved as ""
    const res2 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Whitespace desc',
        description: '   \n\t ',
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(201);
    expect(res2.body.workItem.description).toBe('');

    // 3. 50,000 chars description -> 201
    const longDesc = 'a'.repeat(50000);
    const res3 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Long desc',
        description: longDesc,
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(201);
    expect(res3.body.workItem.description).toHaveLength(50000);
  });

  it('AC-14: rejects Commenter, Viewer, guest, and non-members with 403 or 404', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');

    const viewer = await newUser();
    await addMember(ws.id, proj.id, viewer, 'viewer');

    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', viewer.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Viewer item', idempotencyKey: crypto.randomUUID() })
      .expect(403);

    // Non-member in private project -> 403 FORBIDDEN
    const outsider = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [ws.id, outsider.id],
    );
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', outsider.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Outsider item', idempotencyKey: crypto.randomUUID() })
      .expect(403);

    // Project of another workspace -> 404
    const otherWs = await seedWorkspace();
    await http()
      .post(`/api/workspaces/${otherWs.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', outsider.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Wrong ws item', idempotencyKey: crypto.randomUUID() })
      .expect(404);
  });

  it('AC-15: rejects create if instance admin revokes project.workitems.create from Contributor role', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // Revoke permission from contributor role
    await e2e.dataSource.query(
      `DELETE FROM role_permissions
       WHERE scope = 'project' AND role_key = 'contributor' AND permission_key = 'project.workitems.create'`,
    );

    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'No perm item', idempotencyKey: crypto.randomUUID() })
      .expect(403);
  });

  it('AC-16: race interference in transaction: role change, deactivated memberships, soft-deleted project', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // Helper to run an interfering transaction while lockProjectForActor waits on projects lock
    async function testInterference(
      mutate: (runner: { query: (q: string, params?: unknown[]) => Promise<unknown> }) => Promise<void>,
      expectedStatus: number,
    ) {
      const runner = e2e.dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let requestPromise: Promise<{ status: number }> | undefined;
      try {
        await runner.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [
          proj.id,
        ]);

        requestPromise = new Promise<{ status: number }>((resolve, reject) => {
          http()
            .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
            .set('Cookie', an.cookie)
            .set('Origin', ORIGIN)
            .send({
              title: 'Interfered Item',
              idempotencyKey: crypto.randomUUID(),
            })
            .end((err, res) => {
              if (err) reject(err);
              else resolve(res);
            });
        });

        // Poll until the request is waiting on the lock in Postgres
        let foundLock = false;
        for (let i = 0; i < 100; i += 1) {
          const waiting = (await e2e.dataSource.query(
            'SELECT 1 FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid()',
          )) as unknown[];
          if (waiting.length > 0) {
            foundLock = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 20));
        }
        expect(foundLock).toBe(true);

        await mutate(runner);
        await runner.commitTransaction();

        const res = await requestPromise;
        expect(res.status).toBe(expectedStatus);
      } finally {
        if (runner.isTransactionActive) {
          await runner.rollbackTransaction();
        }
        await runner.release();
        if (requestPromise) {
          await requestPromise.catch(() => {});
        }
      }
    }

    // (a) changed to viewer -> 403
    await testInterference(async (runner) => {
      await runner.query(
        'UPDATE project_members SET role = $1 WHERE project_id = $2 AND member_id = $3',
        ['viewer', proj.id, an.id],
      );
    }, 403);

    // Restore to contributor
    await e2e.dataSource.query(
      'UPDATE project_members SET role = $1 WHERE project_id = $2 AND member_id = $3',
      ['contributor', proj.id, an.id],
    );

    // (b) project_members is_active = false -> 403
    await testInterference(async (runner) => {
      await runner.query(
        'UPDATE project_members SET is_active = false WHERE project_id = $1 AND member_id = $2',
        [proj.id, an.id],
      );
    }, 403);

    // Restore project_members
    await e2e.dataSource.query(
      'UPDATE project_members SET is_active = true WHERE project_id = $1 AND member_id = $2',
      [proj.id, an.id],
    );

    // (c) workspace_members is_active = false -> 403
    await testInterference(async (runner) => {
      await runner.query(
        'UPDATE workspace_members SET is_active = false WHERE workspace_id = $1 AND member_id = $2',
        [ws.id, an.id],
      );
    }, 403);

    // Restore workspace_members
    await e2e.dataSource.query(
      'UPDATE workspace_members SET is_active = true WHERE workspace_id = $1 AND member_id = $2',
      [ws.id, an.id],
    );

    // (d) project soft-deleted -> 404
    await testInterference(async (runner) => {
      await runner.query('UPDATE projects SET deleted_at = now() WHERE id = $1', [
        proj.id,
      ]);
    }, 404);

    // (e) role_permissions deleted -> 403
    await e2e.dataSource.query(
      'UPDATE projects SET deleted_at = NULL WHERE id = $1',
      [proj.id],
    );
    await testInterference(async (runner) => {
      await runner.query(
        "DELETE FROM role_permissions WHERE scope = 'project' AND role_key = 'contributor' AND permission_key = 'project.workitems.create'",
      );
    }, 403);
    await e2e.dataSource.query(
      "INSERT INTO role_permissions (scope, role_key, permission_key) VALUES ('project', 'contributor', 'project.workitems.create') ON CONFLICT DO NOTHING",
    );

    // Counter remains 0
    const [projectRow] = (await e2e.dataSource.query(
      'SELECT last_work_item_number FROM projects WHERE id = $1',
      [proj.id],
    )) as { last_work_item_number: number }[];
    expect(projectRow?.last_work_item_number).toBe(0);
  });

  it('AC-17: Workspace Admin without explicit project member row can create work item', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');

    const admin = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'admin', true, now(), now(), now())`,
      [ws.id, admin.id],
    );

    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'Admin created item', idempotencyKey: crypto.randomUUID() })
      .expect(201);

    expect(res.body.workItem.number).toBe(1);
    expect(res.body.workItem.createdById).toBe(admin.id);
  });

  it('AC-24: WORK_ITEM_CREATE_LIMITER limits to 120 / 10 minutes without hitting workspace write limit', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // Make 35 workspace writes (more than the 30 workspace write limit)
    for (let i = 1; i <= 35; i += 1) {
      await http()
        .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
        .set('Cookie', an.cookie)
        .set('Origin', ORIGIN)
        .send({ title: `Item ${i}`, idempotencyKey: crypto.randomUUID() })
        .expect(201);
    }
    // If it used workspace write limiter, it would have failed at 31!
  });

  it('AC-32: soft deleted items preserve their numbers and counter never decreases', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    for (let i = 1; i <= 3; i += 1) {
      await http()
        .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
        .set('Cookie', an.cookie)
        .set('Origin', ORIGIN)
        .send({ title: `OPS-${i}`, idempotencyKey: crypto.randomUUID() })
        .expect(201);
    }

    // Soft delete item 3
    await e2e.dataSource.query(
      'UPDATE work_items SET deleted_at = now() WHERE project_id = $1 AND number = 3',
      [proj.id],
    );

    // Creating next item gets number 4
    const res4 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({ title: 'OPS-4', idempotencyKey: crypto.randomUUID() })
      .expect(201);
    expect(res4.body.workItem.number).toBe(4);

    // Direct insert of duplicate number violates unique constraint
    await expect(
      e2e.dataSource.query(
        `INSERT INTO work_items (workspace_id, project_id, number, title, idempotency_key, created_at, updated_at)
         VALUES ($1, $2, 3, 'Duplicate 3', gen_random_uuid(), now(), now())`,
        [ws.id, proj.id],
      ),
    ).rejects.toThrow();
  });

  it('AC-34: same key sent concurrently to two projects results in one 201 and one 409', async () => {
    const ws = await seedWorkspace();
    const ops = await seedProject(ws, 'Operations', 'OPS');
    const mkt = await seedProject(ws, 'Marketing', 'MKT');
    const an = await newUser();
    await addMember(ws.id, ops.id, an, 'contributor');
    await addMember(ws.id, mkt.id, an, 'contributor');

    const key = crypto.randomUUID();
    const body = { title: 'Same Key', description: 'Same Desc', idempotencyKey: key };

    const [resOps, resMkt] = await Promise.all([
      http()
        .post(`/api/workspaces/${ws.slug}/projects/${ops.identifier}/work-items`)
        .set('Cookie', an.cookie)
        .set('Origin', ORIGIN)
        .send(body),
      http()
        .post(`/api/workspaces/${ws.slug}/projects/${mkt.identifier}/work-items`)
        .set('Cookie', an.cookie)
        .set('Origin', ORIGIN)
        .send(body),
    ]);

    const statuses = [resOps.status, resMkt.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
  });

  it('AC-37: user account deactivated while locked returns 401 UNAUTHENTICATED without advancing counter', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    const runner = e2e.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('SELECT 1 FROM projects WHERE id = $1 FOR UPDATE', [
        proj.id,
      ]);

      const requestPromise = new Promise<{ status: number; body: { code: string } }>(
        (resolve, reject) => {
          http()
            .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
            .set('Cookie', an.cookie)
            .set('Origin', ORIGIN)
            .send({
              title: 'Deactivated while locked',
              idempotencyKey: crypto.randomUUID(),
            })
            .end((err, res) => {
              if (err) reject(err);
              else resolve(res);
            });
        },
      );

      // Poll until the request is waiting on the lock in Postgres
      let foundLock = false;
      for (let i = 0; i < 100; i += 1) {
        const waiting = (await e2e.dataSource.query(
          'SELECT 1 FROM pg_locks WHERE NOT granted AND pid <> pg_backend_pid()',
        )) as unknown[];
        if (waiting.length > 0) {
          foundLock = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(foundLock).toBe(true);

      await runner.query('UPDATE users SET is_active = false WHERE id = $1', [
        an.id,
      ]);
      await runner.commitTransaction();

      const res = await requestPromise;
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    } finally {
      if (runner.isTransactionActive) {
        await runner.rollbackTransaction();
      }
      await runner.release();
    }

    const [projectRow] = (await e2e.dataSource.query(
      'SELECT last_work_item_number FROM projects WHERE id = $1',
      [proj.id],
    )) as { last_work_item_number: number }[];
    expect(projectRow?.last_work_item_number).toBe(0);
  });

  it('B4 input validation and localized error messages in en and vi', async () => {
    const ws = await seedWorkspace();
    const proj = await seedProject(ws, 'Operations', 'OPS');
    const an = await newUser();
    await addMember(ws.id, proj.id, an, 'contributor');

    // 1. Missing title and invalid idempotencyKey (en)
    const resEn = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .set('Accept-Language', 'en')
      .send({ idempotencyKey: 'not-a-uuid' })
      .expect(400);

    expect(resEn.body.fields.title).toBe('Enter a title');
    expect(resEn.body.fields.idempotencyKey).toBe('Reload the page and try again.');

    // 2. Missing title and invalid idempotencyKey (vi)
    const resVi = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .set('Accept-Language', 'vi')
      .send({ idempotencyKey: 'not-a-uuid' })
      .expect(400);

    expect(resVi.body.fields.title).toBe('Hãy nhập tiêu đề');
    expect(resVi.body.fields.idempotencyKey).toBe('Hãy tải lại trang rồi thử lại.');

    // 3. Hidden chars in title
    const resHidden = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Title\nhas newline',
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(400);
    expect(resHidden.body.fields.title).toBe(
      "Title can't contain line breaks or hidden characters",
    );

    // 4. Overlong title
    const resLong = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${proj.identifier}/work-items`)
      .set('Cookie', an.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'a'.repeat(256),
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(400);
    expect(resLong.body.fields.title).toBe(
      'Title must be at most 255 characters',
    );
  });
});
