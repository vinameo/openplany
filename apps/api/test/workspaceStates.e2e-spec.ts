import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type StateListResponse,
  type StateMutationResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  signInCookie,
  DEFAULT_E2E_ORIGIN as ORIGIN,
} from './helpers/e2eUsers.js';
import { insertWorkItem } from './helpers/e2eWorkItems.js';

describe('Workspace States API (e2e)', () => {
  let e2e: E2eApp;
  let userSeq = 0;
  let projSeq = 0;

  beforeAll(async () => {
    e2e = await createE2eApp();
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
    const email = `ws-state-user-${userSeq}@openplany.dev`;
    const id = await createUser(e2e, email, {
      is_superuser: opts.instanceAdmin ?? false,
    });
    return { id, email, cookie: await signInCookie(e2e, email) };
  }

  async function seedWorkspace(opts: { name?: string; slug?: string } = {}) {
    const wsAdmin = await newUser({ instanceAdmin: true });
    const slug = opts.slug ?? `ws-states-${userSeq}`;
    const wsRes = await http()
      .post('/api/workspaces')
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: opts.name ?? 'Workspace for States',
        slug,
        organizationSize: '2-10',
      })
      .expect(201);
    const workspaceId = wsRes.body.id as string;
    const workspaceSlug = wsRes.body.slug as string;

    return {
      workspaceId,
      workspaceSlug,
      wsAdmin,
    };
  }

  async function seedProject(workspaceSlug: string, wsAdminCookie: string) {
    projSeq += 1;
    const prjRes = await http()
      .post(`/api/workspaces/${workspaceSlug}/projects`)
      .set('Cookie', wsAdminCookie)
      .set('Origin', ORIGIN)
      .send({
        name: `Project ${projSeq}`,
        identifier: `PRJ${projSeq}`,
        description: 'Test project',
        icon: {
          name: DEFAULT_PROJECT_ICON,
          color: DEFAULT_PROJECT_ICON_COLOR,
        },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    return {
      projectId: prjRes.body.project.id as string,
      projectIdentifier: prjRes.body.project.identifier as string,
    };
  }

  async function addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: 'admin' | 'member' = 'member',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, true, now(), now(), now())
       ON CONFLICT (workspace_id, member_id) DO NOTHING`,
      [workspaceId, userId, role],
    );
  }

  it('reset() seeds exactly 5 default rows (D33, N-1)', async () => {
    const rows = await e2e.dataSource.query<
      { level: string; default_key: string; name: string }[]
    >(
      "SELECT level, default_key, name FROM work_item_states WHERE level = 'default' ORDER BY default_key",
    );
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.default_key)).toEqual([
      'backlog',
      'cancelled',
      'done',
      'in_progress',
      'todo',
    ]);
  });

  describe('Permissions and access (AC-01, AC-02, AC-03, AC-11, AC-12)', () => {
    it('member without workspace.settings.view receives 403 on GET (AC-01)', async () => {
      const { workspaceId, workspaceSlug } = await seedWorkspace();

      const member = await newUser();
      await addWorkspaceMember(workspaceId, member.id, 'member');

      // Member default role has workspace.settings.view revoked by removing permission from role_permissions
      await e2e.dataSource.query(
        `DELETE FROM role_permissions
         WHERE scope = 'workspace' AND role_key = 'member' AND permission_key = 'workspace.settings.view'`,
      );

      const res = await http()
        .get(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', member.cookie)
        .set('Origin', ORIGIN)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('member with workspace.settings.view sees list without workItemCount and cannot POST (AC-03, AC-11)', async () => {
      const { workspaceId, workspaceSlug } = await seedWorkspace();

      const member = await newUser();
      await addWorkspaceMember(workspaceId, member.id, 'member');

      // GET succeeds but no workItemCount is returned
      const getRes = await http()
        .get(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', member.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const body = getRes.body as StateListResponse;
      expect(body.states.length).toBeGreaterThanOrEqual(5);
      for (const s of body.states) {
        expect(s.workItemCount).toBeUndefined();
      }

      // POST fails with 403 FORBIDDEN
      const postRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', member.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Member State',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(403);
      expect(postRes.body.code).toBe('FORBIDDEN');
    });

    it('Workspace Admin sees workItemCount and can create workspace states (AC-02, AC-11)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      // Admin GET returns workItemCount on states
      const getRes = await http()
        .get(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const getBody = getRes.body as StateListResponse;
      expect(getBody.ownCount).toBe(0);
      expect(getBody.ownMax).toBe(50);
      expect(getBody.initialStateId).toBeDefined();
      for (const s of getBody.states) {
        expect(s.workItemCount).toBeDefined();
      }

      // Admin POST creates new state
      const postRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'QA',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);

      const postBody = postRes.body as StateMutationResponse;
      expect(postBody.state.name).toBe('QA');
      expect(postBody.state.level).toBe('workspace');
      expect(postBody.state.group).toBe('active');
      expect(postBody.state.workItemCount).toBe(0);
    });

    it('granting workspace.states.manage to member enables creating states (AC-11)', async () => {
      const { workspaceId, workspaceSlug } = await seedWorkspace();

      const member = await newUser();
      await addWorkspaceMember(workspaceId, member.id, 'member');

      // Grant workspace.states.manage to member role
      await e2e.dataSource.query(
        `INSERT INTO role_permissions (scope, role_key, permission_key)
         VALUES ('workspace', 'member', 'workspace.states.manage')
         ON CONFLICT DO NOTHING`,
      );

      const postRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', member.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Granted Member State',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);

      expect((postRes.body as StateMutationResponse).state.name).toBe(
        'Granted Member State',
      );
    });

    it('deactivated user returns 401 UNAUTHENTICATED (AC-12)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      // Deactivate user in database
      await e2e.dataSource.query(
        `UPDATE users SET is_active = false WHERE id = $1`,
        [wsAdmin.id],
      );

      await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Deactivated State',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(401);
    });
  });

  describe('Response shape and leakage check (INV-12)', () => {
    it('returns only StateResponse fields without internal columns', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      const res = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Shape Check',
          group: 'active',
          color: '#E08A1E',
        })
        .expect(201);

      const body = res.body as StateMutationResponse;
      expect(body.state).toBeDefined();
      const keys = Object.keys(body.state).sort();
      expect(keys).toEqual([
        'color',
        'group',
        'id',
        'level',
        'name',
        'workItemCount',
      ]);

      const raw = body.state as unknown as Record<string, unknown>;
      expect(raw.workspaceId).toBeUndefined();
      expect(raw.projectId).toBeUndefined();
      expect(raw.defaultKey).toBeUndefined();
      expect(raw.createdById).toBeUndefined();
      expect(raw.updatedById).toBeUndefined();
      expect(raw.deletedAt).toBeUndefined();
    });
  });

  describe('Work item counts (INV-12, AC-07)', () => {
    it('filters work item counts to active projects of the workspace in URL and excludes other workspaces (AC-07)', async () => {
      const ws1 = await seedWorkspace({ slug: `ws1-${userSeq}` });
      const prj1a = await seedProject(ws1.workspaceSlug, ws1.wsAdmin.cookie);
      const prj1b = await seedProject(ws1.workspaceSlug, ws1.wsAdmin.cookie);

      // Create workspace state QA in W1
      const qaRes = await http()
        .post(`/api/workspaces/${ws1.workspaceSlug}/states`)
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'QA',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);
      const qaStateId = (qaRes.body as StateMutationResponse).state.id;

      // Get default Backlog id
      const [backlogRow] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'backlog'`,
      );
      const backlogId = backlogRow.id;

      // In W1 prj1a: 2 Backlog items
      for (let i = 1; i <= 2; i++) {
        await insertWorkItem(e2e.dataSource, {
          workspaceId: ws1.workspaceId,
          projectId: prj1a.projectId,
          number: i,
          title: `W1 Item ${i}`,
          stateId: backlogId,
          createdById: ws1.wsAdmin.id,
        });
      }
      // In W1 prj1b: 1 Backlog item, 2 QA items
      await insertWorkItem(e2e.dataSource, {
        workspaceId: ws1.workspaceId,
        projectId: prj1b.projectId,
        number: 1,
        title: 'W1 1b Item 1',
        stateId: backlogId,
        createdById: ws1.wsAdmin.id,
      });
      for (let i = 2; i <= 3; i++) {
        await insertWorkItem(e2e.dataSource, {
          workspaceId: ws1.workspaceId,
          projectId: prj1b.projectId,
          number: i,
          title: `W1 QA Item ${i}`,
          stateId: qaStateId,
          createdById: ws1.wsAdmin.id,
        });
      }

      // Add soft-deleted project in W1 with 1 Backlog item (must not count!)
      const prj1Deleted = await seedProject(
        ws1.workspaceSlug,
        ws1.wsAdmin.cookie,
      );
      await insertWorkItem(e2e.dataSource, {
        workspaceId: ws1.workspaceId,
        projectId: prj1Deleted.projectId,
        number: 1,
        title: 'Deleted Project Item',
        stateId: backlogId,
        createdById: ws1.wsAdmin.id,
      });
      await e2e.dataSource.query(
        `UPDATE projects SET deleted_at = now() WHERE id = $1`,
        [prj1Deleted.projectId],
      );

      // Now create W2 with 500 Backlog work items
      const ws2 = await seedWorkspace({ slug: `ws2-${userSeq}` });
      const prj2 = await seedProject(ws2.workspaceSlug, ws2.wsAdmin.cookie);
      for (let i = 1; i <= 20; i++) {
        await insertWorkItem(e2e.dataSource, {
          workspaceId: ws2.workspaceId,
          projectId: prj2.projectId,
          number: i,
          title: `W2 Item ${i}`,
          stateId: backlogId,
          createdById: ws2.wsAdmin.id,
        });
      }

      // GET states for W1
      const res = await http()
        .get(`/api/workspaces/${ws1.workspaceSlug}/states`)
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const list = res.body as StateListResponse;
      const backlogState = list.states.find((s) => s.id === backlogId);
      const qaState = list.states.find((s) => s.id === qaStateId);

      // In W1: 3 Backlog items (2 in prj1a, 1 in prj1b; deleted project excluded)
      expect(backlogState?.workItemCount).toBe(3);
      // In W1: 2 QA items
      expect(qaState?.workItemCount).toBe(2);
    });
  });

  describe('Cross-level ID and route scoping (INV-03, AC-08, AC-09, AC-10)', () => {
    it('returns 404 STATE_NOT_FOUND when default state ID is passed to workspace PATCH/DELETE (AC-08)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      const [defaultTodo] = await e2e.dataSource.query<
        { id: string; name: string }[]
      >(`SELECT id, name FROM work_item_states WHERE default_key = 'todo'`);

      // PATCH default state via workspace route -> 404
      const patchRes = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${defaultTodo.id}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Hacked Todo' })
        .expect(404);
      expect(patchRes.body.code).toBe('STATE_NOT_FOUND');

      // DELETE default state via workspace route -> 404
      const delRes = await http()
        .delete(`/api/workspaces/${workspaceSlug}/states/${defaultTodo.id}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(delRes.body.code).toBe('STATE_NOT_FOUND');

      // Check DB: default row is intact
      const [checkRow] = await e2e.dataSource.query<{ name: string }[]>(
        `SELECT name FROM work_item_states WHERE id = $1`,
        [defaultTodo.id],
      );
      expect(checkRow.name).toBe('Todo');
    });

    it('returns 404 STATE_NOT_FOUND when workspace state is accessed via project route, and vice versa (AC-09)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();
      const { projectId, projectIdentifier } = await seedProject(
        workspaceSlug,
        wsAdmin.cookie,
      );

      // Create workspace state
      const wsStateRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'WS State', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const wsStateId = (wsStateRes.body as StateMutationResponse).state.id;

      // Create project state directly in DB
      const [projStateRow] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'project', $1, $2, 'Project State', 'active', '#7A5CC7', now(), now())
         RETURNING id`,
        [workspaceId, projectId],
      );
      const projStateId = projStateRow.id;

      // Access workspace state via project route -> 404 (AC-09)
      const pRes = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${wsStateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'New Name' })
        .expect(404);
      expect(pRes.body.code).toBe('STATE_NOT_FOUND');

      // Access project state via workspace route -> 404 (AC-09)
      const wRes = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${projStateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'New Name' })
        .expect(404);
      expect(wRes.body.code).toBe('STATE_NOT_FOUND');
    });

    it('returns identical 404 body for other workspace state, soft-deleted state, random UUID, or non-UUID (AC-10)', async () => {
      const ws1 = await seedWorkspace({ slug: `ws-one-${userSeq}` });
      const ws2 = await seedWorkspace({ slug: `ws-two-${userSeq}` });

      // State in ws2
      const ws2StateRes = await http()
        .post(`/api/workspaces/${ws2.workspaceSlug}/states`)
        .set('Cookie', ws2.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'WS2 State', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const ws2StateId = (ws2StateRes.body as StateMutationResponse).state.id;

      // Soft-deleted state in ws1
      const [deletedRow] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (id, level, workspace_id, name, state_group, color, created_at, updated_at, deleted_at)
         VALUES (gen_random_uuid(), 'workspace', $1, 'Deleted State', 'active', '#3E7BD6', now(), now(), now())
         RETURNING id`,
        [ws1.workspaceId],
      );
      const deletedStateId = deletedRow.id;

      // 1. Other workspace state via ws1 route
      const resOther = await http()
        .patch(`/api/workspaces/${ws1.workspaceSlug}/states/${ws2StateId}`)
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Renamed' })
        .expect(404);

      // 2. Soft-deleted state
      const resDeleted = await http()
        .patch(`/api/workspaces/${ws1.workspaceSlug}/states/${deletedStateId}`)
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Renamed' })
        .expect(404);

      // 3. Random UUID
      const resRandom = await http()
        .patch(
          `/api/workspaces/${ws1.workspaceSlug}/states/00000000-0000-0000-0000-000000000000`,
        )
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Renamed' })
        .expect(404);

      // 4. Non-UUID
      const resNonUuid = await http()
        .patch(`/api/workspaces/${ws1.workspaceSlug}/states/not-a-uuid`)
        .set('Cookie', ws1.wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Renamed' })
        .expect(404);

      expect(resOther.body.code).toBe(resDeleted.body.code);
      expect(resOther.body.code).toBe(resRandom.body.code);
      expect(resOther.body.code).toBe(resNonUuid.body.code);
      expect(resOther.body.message).toBe(resDeleted.body.message);
      expect(resOther.body.message).toBe(resRandom.body.message);
      expect(resOther.body.message).toBe(resNonUuid.body.message);
      expect(resOther.body.code).toBe('STATE_NOT_FOUND');
    });
  });

  describe('Name collisions (INV-06, AC-17, AC-18, AC-19, AC-45)', () => {
    it('rejects duplicate name against default states with 409 STATE_NAME_TAKEN (AC-17)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      const res = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: '  backlog  ',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN');
      expect(res.body.fields?.name).toBeDefined();
    });

    it('rejects workspace name clash against project states with 409 STATE_NAME_TAKEN_IN_PROJECTS and project count (AC-18)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();

      // Seed 2 active projects and 1 deleted project
      const prj1 = await seedProject(workspaceSlug, wsAdmin.cookie);
      const prj2 = await seedProject(workspaceSlug, wsAdmin.cookie);
      const prj3 = await seedProject(workspaceSlug, wsAdmin.cookie);

      // Project states "QA" in all 3 projects
      await e2e.dataSource.query(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'project', $1, $2, 'QA', 'active', '#3E7BD6', now(), now()),
                (gen_random_uuid(), 'project', $1, $3, 'QA', 'active', '#3E7BD6', now(), now()),
                (gen_random_uuid(), 'project', $1, $4, 'QA', 'active', '#3E7BD6', now(), now())`,
        [workspaceId, prj1.projectId, prj2.projectId, prj3.projectId],
      );

      // Soft delete prj3
      await e2e.dataSource.query(
        `UPDATE projects SET deleted_at = now() WHERE id = $1`,
        [prj3.projectId],
      );

      // Workspace adds "qa" -> fails with count = 2
      const res = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'qa',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN_IN_PROJECTS');
      expect(res.body.count).toBe(2);
      expect(res.body.fields?.name).toBeDefined();

      // Ensure NO project names or IDs appear in error response body
      const rawText = JSON.stringify(res.body);
      expect(rawText).not.toContain(prj1.projectId);
      expect(rawText).not.toContain(prj2.projectId);
      expect(rawText).not.toContain(prj3.projectId);
    });

    it('allows changing case of own workspace state, rejects rename to default (AC-19)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      const created = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'QA',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);
      const stateId = (created.body as StateMutationResponse).state.id;

      // Rename "QA" to "qa" -> 200 (AC-19)
      const renameOk = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'qa' })
        .expect(200);
      expect((renameOk.body as StateMutationResponse).state.name).toBe('qa');

      // Rename to "Todo" (default state) -> 409 STATE_NAME_TAKEN (AC-19)
      const renameClash = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Todo' })
        .expect(409);
      expect(renameClash.body.code).toBe('STATE_NAME_TAKEN');
    });

    it('rejects renaming workspace state to match existing project state (AC-45)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();
      const prj = await seedProject(workspaceSlug, wsAdmin.cookie);

      // Create project state "Review"
      await e2e.dataSource.query(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'project', $1, $2, 'Review', 'active', '#7A5CC7', now(), now())`,
        [workspaceId, prj.projectId],
      );

      // Create workspace state "Temporary"
      const created = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Temporary', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateId = (created.body as StateMutationResponse).state.id;

      // Rename "Temporary" to "review" -> 409 STATE_NAME_TAKEN_IN_PROJECTS, count = 1
      const res = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'review' })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN_IN_PROJECTS');
      expect(res.body.count).toBe(1);
    });
  });

  describe('Workspace state limits (INV-07, AC-21)', () => {
    it('rejects creating 51st state with 409 WORKSPACE_STATE_LIMIT_REACHED; deletion allows creating again (AC-21)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();

      // Seed 50 workspace states directly in DB
      let lastId = '';
      for (let i = 1; i <= 50; i++) {
        const rows = await e2e.dataSource.query<{ id: string }[]>(
          `INSERT INTO work_item_states (id, level, workspace_id, name, state_group, color, created_at, updated_at)
           VALUES (gen_random_uuid(), 'workspace', $1, $2, 'active', '#3E7BD6', now(), now())
           RETURNING id`,
          [workspaceId, `State ${i}`],
        );
        lastId = rows[0].id;
      }

      // 51st creation fails with 409
      const failRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'State 51',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(409);
      expect(failRes.body.code).toBe('WORKSPACE_STATE_LIMIT_REACHED');

      // Delete one state
      await http()
        .delete(`/api/workspaces/${workspaceSlug}/states/${lastId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Now creation succeeds
      await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'State 51',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);
    });
  });

  describe('State deletion and work item migration (INV-08, AC-23, AC-25, AC-26, AC-27)', () => {
    it('deletes unused state without replacementStateId (AC-23)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      const created = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'To Delete', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateId = (created.body as StateMutationResponse).state.id;

      await http()
        .delete(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Name can be reused immediately (AC-23)
      await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'To Delete', group: 'active', color: '#3E7BD6' })
        .expect(201);
    });

    it('rejects invalid replacement states and requires replacement when live work items exist (AC-25, AC-27)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();
      const prj1 = await seedProject(workspaceSlug, wsAdmin.cookie);
      const prj2 = await seedProject(workspaceSlug, wsAdmin.cookie);

      // Create target state "QA"
      const qaRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'QA', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const qaId = (qaRes.body as StateMutationResponse).state.id;

      // Seed 2 work items in prj1, 1 in prj2 with past timestamp
      const pastTime = new Date('2026-01-01T00:00:00.000Z');
      const itemIds: string[] = [];
      const item1 = await insertWorkItem(e2e.dataSource, {
        workspaceId,
        projectId: prj1.projectId,
        number: 1,
        title: 'Item 1',
        stateId: qaId,
        createdById: wsAdmin.id,
        createdAt: pastTime,
        updatedAt: pastTime,
      });
      itemIds.push(item1.id);

      const item2 = await insertWorkItem(e2e.dataSource, {
        workspaceId,
        projectId: prj1.projectId,
        number: 2,
        title: 'Item 2',
        stateId: qaId,
        createdById: wsAdmin.id,
        createdAt: pastTime,
        updatedAt: pastTime,
      });
      itemIds.push(item2.id);

      const item3 = await insertWorkItem(e2e.dataSource, {
        workspaceId,
        projectId: prj2.projectId,
        number: 1,
        title: 'Item 3',
        stateId: qaId,
        createdById: wsAdmin.id,
        createdAt: pastTime,
        updatedAt: pastTime,
      });
      itemIds.push(item3.id);

      // 1. DELETE without replacement fails with 409 STATE_REPLACEMENT_REQUIRED
      const reqRes = await http()
        .delete(`/api/workspaces/${workspaceSlug}/states/${qaId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(reqRes.body.code).toBe('STATE_REPLACEMENT_REQUIRED');

      // 2. Replacement is target itself -> 409 STATE_REPLACEMENT_INVALID (AC-27)
      const selfRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/states/${qaId}?replacementStateId=${qaId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(selfRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // 3. Replacement is a project-level state -> 409 STATE_REPLACEMENT_INVALID (AC-25)
      const [projState] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'project', $1, $2, 'Prj Only', 'active', '#7A5CC7', now(), now())
         RETURNING id`,
        [workspaceId, prj1.projectId],
      );
      const prjRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/states/${qaId}?replacementStateId=${projState.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(prjRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // 4. Replacement is default state "In Progress" -> 204, work items move, updated_at unchanged (AC-25)
      const [inProgressState] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'in_progress'`,
      );

      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/states/${qaId}?replacementStateId=${inProgressState.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Verify work items are moved to In Progress and updated_at is preserved
      for (const id of itemIds) {
        const [wi] = await e2e.dataSource.query<
          { state_id: string; updated_at: Date }[]
        >(`SELECT state_id, updated_at FROM work_items WHERE id = $1`, [id]);
        expect(wi.state_id).toBe(inProgressState.id);
        expect(new Date(wi.updated_at).getTime()).toBe(pastTime.getTime());
      }
    });

    it('leaves hidden work items in soft-deleted projects pointing to old deleted state (AC-26)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();
      const prjActive = await seedProject(workspaceSlug, wsAdmin.cookie);
      const prjDeleted = await seedProject(workspaceSlug, wsAdmin.cookie);

      const targetRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Target QA', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const targetId = (targetRes.body as StateMutationResponse).state.id;

      // Work item in active project
      const [activeItem] = await insertWorkItem(e2e.dataSource, {
        workspaceId,
        projectId: prjActive.projectId,
        number: 1,
        title: 'Active Item',
        stateId: targetId,
        createdById: wsAdmin.id,
      });

      // Work item in deleted project
      const [hiddenItem] = await insertWorkItem(e2e.dataSource, {
        workspaceId,
        projectId: prjDeleted.projectId,
        number: 1,
        title: 'Hidden Item',
        stateId: targetId,
        createdById: wsAdmin.id,
      });

      // Soft delete prjDeleted
      await e2e.dataSource.query(
        `UPDATE projects SET deleted_at = now() WHERE id = $1`,
        [prjDeleted.projectId],
      );

      const [defaultTodo] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // Delete target state
      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/states/${targetId}?replacementStateId=${defaultTodo.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Active item moved to Todo
      const [activeRow] = await e2e.dataSource.query<{ state_id: string }[]>(
        `SELECT state_id FROM work_items WHERE id = $1`,
        [activeItem.id],
      );
      expect(activeRow.state_id).toBe(defaultTodo.id);

      // Hidden item remains pointing to targetId
      const [hiddenRow] = await e2e.dataSource.query<{ state_id: string }[]>(
        `SELECT state_id FROM work_items WHERE id = $1`,
        [hiddenItem.id],
      );
      expect(hiddenRow.state_id).toBe(targetId);
    });
  });

  describe('Group change confirmation (INV-19, AC-39, AC-42, AC-47)', () => {
    it('changes group without confirmation when state has 0 work items; requires confirmGroupChange when items exist (AC-39, AC-47)', async () => {
      const { workspaceId, workspaceSlug, wsAdmin } = await seedWorkspace();
      const prj = await seedProject(workspaceSlug, wsAdmin.cookie);

      const created = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Group Test', group: 'planned', color: '#5B6B82' })
        .expect(201);
      const stateId = (created.body as StateMutationResponse).state.id;

      // 0 work items: changes group immediately (AC-39)
      const patch1 = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ group: 'active' })
        .expect(200);
      expect((patch1.body as StateMutationResponse).state.group).toBe('active');

      // Add 2 work items
      for (let i = 1; i <= 2; i++) {
        await insertWorkItem(e2e.dataSource, {
          workspaceId,
          projectId: prj.projectId,
          number: i,
          title: `Item ${i}`,
          stateId,
          createdById: wsAdmin.id,
        });
      }

      // Group change without confirmation -> 409 STATE_GROUP_CHANGE_UNCONFIRMED with count: 2
      const failRes = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ group: 'finished' })
        .expect(409);
      expect(failRes.body.code).toBe('STATE_GROUP_CHANGE_UNCONFIRMED');
      expect(failRes.body.count).toBe(2);

      // Non-boolean confirmGroupChange -> 400 (AC-47)
      await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ group: 'finished', confirmGroupChange: 'true' })
        .expect(400);

      // confirmGroupChange: true -> 200
      const okRes = await http()
        .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ group: 'finished', confirmGroupChange: true })
        .expect(200);
      expect((okRes.body as StateMutationResponse).state.group).toBe(
        'finished',
      );
      expect((okRes.body as StateMutationResponse).state.workItemCount).toBe(2);
    });
  });

  describe('Rate limiting (API B2.1, AC-44)', () => {
    it('enforces 60 write requests limit and returns 429 TOO_MANY_ATTEMPTS (AC-44)', async () => {
      const { workspaceSlug, wsAdmin } = await seedWorkspace();

      // 1st write: create a state
      const created = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Rate Base',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);

      const stateId = (created.body as StateMutationResponse).state.id;

      // 59 more writes: patch color repeatedly (total 60 writes)
      for (let i = 2; i <= 60; i++) {
        const color = i % 2 === 0 ? '#2F9E6E' : '#3E7BD6';
        await http()
          .patch(`/api/workspaces/${workspaceSlug}/states/${stateId}`)
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN)
          .send({ color })
          .expect(200);
      }

      // 61st request fails with 429
      const limitRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/states`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Rate State 61',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(429);

      expect(limitRes.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(limitRes.body.retryAfterSeconds).toBeDefined();
    });
  });
});
