import crypto from 'node:crypto';
import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  DEFAULT_STATE_KEYS,
  type StateMutationResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  signInCookie,
  DEFAULT_E2E_ORIGIN as ORIGIN,
} from './helpers/e2eUsers.js';
import { insertWorkItem } from './helpers/e2eWorkItems.js';

describe('State Concurrency & Lock Graph (e2e)', () => {
  let e2e: E2eApp;
  let userSeq = 0;

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
    const email = `concurrency-user-${userSeq}@openplany.dev`;
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
    return {
      id: wsRes.body.id as string,
      slug: wsRes.body.slug as string,
      owner,
    };
  }

  async function addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: 'admin' | 'member' = 'admin',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, true, now(), now(), now())
       ON CONFLICT (workspace_id, member_id) DO NOTHING`,
      [workspaceId, userId, role],
    );
  }

  async function addProjectMember(
    workspaceId: string,
    projectId: string,
    userId: string,
    role: 'admin' | 'contributor' = 'admin',
  ) {
    await addWorkspaceMember(workspaceId, userId, 'admin');
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, 'project', true, now(), now(), now())
       ON CONFLICT (project_id, member_id) DO NOTHING`,
      [projectId, workspaceId, userId, role],
    );
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

  it('e2e setup preserves 5 default states with fixed keys after reset (D33)', async () => {
    const defaultStates = await e2e.dataSource.query<
      { default_key: string; level: string; deleted_at: string | null }[]
    >(
      `SELECT default_key, level, deleted_at FROM work_item_states WHERE level = 'default'`,
    );

    expect(defaultStates.length).toBe(5);
    const keys = defaultStates.map((s) => s.default_key).sort();
    expect(keys).toEqual([...DEFAULT_STATE_KEYS].sort());
    for (const s of defaultStates) {
      expect(s.deleted_at).toBeNull();
    }
  });

  describe('AC-14: Concurrent State Creation (Same Name)', () => {
    it('workspace level: two concurrent create requests with same name -> one 201, one 409 STATE_NAME_TAKEN', async () => {
      const ws = await seedWorkspace();
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addWorkspaceMember(ws.id, admin1.id, 'admin');
      await addWorkspaceMember(ws.id, admin2.id, 'admin');

      const [res1, res2] = await Promise.all([
        http()
          .post(`/api/workspaces/${ws.slug}/states`)
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'QA Team', group: 'active', color: '#3E7BD6' }),
        http()
          .post(`/api/workspaces/${ws.slug}/states`)
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'qa team', group: 'active', color: '#3E7BD6' }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const takenRes = res1.status === 409 ? res1 : res2;
      expect(takenRes.body.code).toBe('STATE_NAME_TAKEN');

      const countRows = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM work_item_states
         WHERE workspace_id = $1 AND level = 'workspace' AND lower(name) = 'qa team' AND deleted_at IS NULL`,
        [ws.id],
      );
      expect(countRows[0].count).toBe('1');
    });

    it('project level: two concurrent create requests with same name -> one 201, one 409 STATE_NAME_TAKEN', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addProjectMember(ws.id, project.id, admin1.id, 'admin');
      await addProjectMember(ws.id, project.id, admin2.id, 'admin');

      const [res1, res2] = await Promise.all([
        http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
          )
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'Code Review', group: 'active', color: '#7A5CC7' }),
        http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
          )
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'code review', group: 'active', color: '#7A5CC7' }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const takenRes = res1.status === 409 ? res1 : res2;
      expect(takenRes.body.code).toBe('STATE_NAME_TAKEN');

      const countRows = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM work_item_states
         WHERE project_id = $1 AND level = 'project' AND lower(name) = 'code review' AND deleted_at IS NULL`,
        [project.id],
      );
      expect(countRows[0].count).toBe('1');
    });

    it('cross-level: concurrent create at workspace vs project with same name -> one 201, one 409', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addWorkspaceMember(ws.id, admin1.id, 'admin');
      await addProjectMember(ws.id, project.id, admin2.id, 'admin');

      const [resWs, resPrj] = await Promise.all([
        http()
          .post(`/api/workspaces/${ws.slug}/states`)
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'Design Review', group: 'active', color: '#3E7BD6' }),
        http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
          )
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'Design Review', group: 'active', color: '#3E7BD6' }),
      ]);

      const statuses = [resWs.status, resPrj.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      if (resWs.status === 409) {
        expect(resWs.body.code).toBe('STATE_NAME_TAKEN_IN_PROJECTS');
        expect(resWs.body.count).toBe(1);
        expect(resPrj.status).toBe(201);
      } else {
        expect(resWs.status).toBe(201);
        expect(resPrj.status).toBe(409);
        expect(resPrj.body.code).toBe('STATE_NAME_TAKEN');
      }

      // Check effective states of project has exactly one Design Review
      const countRows = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM work_item_states
         WHERE workspace_id = $1 AND lower(name) = 'design review' AND deleted_at IS NULL`,
        [ws.id],
      );
      expect(countRows[0].count).toBe('1');
    });
  });

  describe('AC-15: Concurrent State Creation at Limit Ceiling (49 -> 50)', () => {
    it('workspace level: two concurrent create requests at count 49 -> one 201, one 409 WORKSPACE_STATE_LIMIT_REACHED', async () => {
      const ws = await seedWorkspace();
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addWorkspaceMember(ws.id, admin1.id, 'admin');
      await addWorkspaceMember(ws.id, admin2.id, 'admin');

      // Pre-seed 49 workspace states
      const stateValues = Array.from({ length: 49 }, (_, i) => {
        const id = crypto.randomUUID();
        return `('${id}', 'workspace', '${ws.id}', null, 'ws-state-${i}', 'active', '#3E7BD6', '${ws.owner.id}', '${ws.owner.id}', NOW(), NOW())`;
      }).join(',\n');

      await e2e.dataSource.query(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_by_id, updated_by_id, created_at, updated_at)
         VALUES ${stateValues}`,
      );

      const [res1, res2] = await Promise.all([
        http()
          .post(`/api/workspaces/${ws.slug}/states`)
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'State 50 A', group: 'active', color: '#3E7BD6' }),
        http()
          .post(`/api/workspaces/${ws.slug}/states`)
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'State 50 B', group: 'active', color: '#3E7BD6' }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const limitRes = res1.status === 409 ? res1 : res2;
      expect(limitRes.body.code).toBe('WORKSPACE_STATE_LIMIT_REACHED');

      // Final live count is exactly 50
      const countRows = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM work_item_states
         WHERE workspace_id = $1 AND level = 'workspace' AND deleted_at IS NULL`,
        [ws.id],
      );
      expect(countRows[0].count).toBe('50');
    });

    it('project level: two concurrent create requests at count 49 -> one 201, one 409 PROJECT_STATE_LIMIT_REACHED', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addProjectMember(ws.id, project.id, admin1.id, 'admin');
      await addProjectMember(ws.id, project.id, admin2.id, 'admin');

      // Pre-seed 49 project states
      const stateValues = Array.from({ length: 49 }, (_, i) => {
        const id = crypto.randomUUID();
        return `('${id}', 'project', '${ws.id}', '${project.id}', 'prj-state-${i}', 'active', '#7A5CC7', '${ws.owner.id}', '${ws.owner.id}', NOW(), NOW())`;
      }).join(',\n');

      await e2e.dataSource.query(
        `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_by_id, updated_by_id, created_at, updated_at)
         VALUES ${stateValues}`,
      );

      const [res1, res2] = await Promise.all([
        http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
          )
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'State 50 A', group: 'active', color: '#7A5CC7' }),
        http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
          )
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'State 50 B', group: 'active', color: '#7A5CC7' }),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);

      const limitRes = res1.status === 409 ? res1 : res2;
      expect(limitRes.body.code).toBe('PROJECT_STATE_LIMIT_REACHED');

      // Final live count is exactly 50
      const countRows = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*)::text as count FROM work_item_states
         WHERE project_id = $1 AND level = 'project' AND deleted_at IS NULL`,
        [project.id],
      );
      expect(countRows[0].count).toBe('50');
    });
  });

  describe('AC-16: Concurrent Cross Deletion (A replaces B, B replaces A)', () => {
    it('workspace level: concurrent cross delete -> one 204, one 409 STATE_REPLACEMENT_INVALID, no deadlock', async () => {
      const ws = await seedWorkspace();
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addWorkspaceMember(ws.id, admin1.id, 'admin');
      await addWorkspaceMember(ws.id, admin2.id, 'admin');

      const stateARes = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State Alpha', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateAId = (stateARes.body as StateMutationResponse).state.id;

      const stateBRes = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State Beta', group: 'active', color: '#2F9E6E' })
        .expect(201);
      const stateBId = (stateBRes.body as StateMutationResponse).state.id;

      const [res1, res2] = await Promise.all([
        http()
          .delete(
            `/api/workspaces/${ws.slug}/states/${stateAId}?replacementStateId=${stateBId}`,
          )
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN),
        http()
          .delete(
            `/api/workspaces/${ws.slug}/states/${stateBId}?replacementStateId=${stateAId}`,
          )
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([204, 409]);

      const failRes = res1.status === 409 ? res1 : res2;
      expect(failRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // Exactly one state is soft-deleted, one remains live
      const states = await e2e.dataSource.query<
        { id: string; deleted_at: string | null }[]
      >(`SELECT id, deleted_at FROM work_item_states WHERE id IN ($1, $2)`, [
        stateAId,
        stateBId,
      ]);
      const liveStates = states.filter((s) => s.deleted_at === null);
      const deletedStates = states.filter((s) => s.deleted_at !== null);
      expect(liveStates.length).toBe(1);
      expect(deletedStates.length).toBe(1);
    });

    it('project level: concurrent cross delete -> one 204, one 409 STATE_REPLACEMENT_INVALID, no deadlock', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);
      const admin1 = await newUser({ instanceAdmin: true });
      const admin2 = await newUser({ instanceAdmin: true });
      await addProjectMember(ws.id, project.id, admin1.id, 'admin');
      await addProjectMember(ws.id, project.id, admin2.id, 'admin');

      const stateARes = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Project Alpha', group: 'active', color: '#7A5CC7' })
        .expect(201);
      const stateAId = (stateARes.body as StateMutationResponse).state.id;

      const stateBRes = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Project Beta', group: 'active', color: '#2F9E6E' })
        .expect(201);
      const stateBId = (stateBRes.body as StateMutationResponse).state.id;

      const [res1, res2] = await Promise.all([
        http()
          .delete(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/${stateAId}?replacementStateId=${stateBId}`,
          )
          .set('Cookie', admin1.cookie)
          .set('Origin', ORIGIN),
        http()
          .delete(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/${stateBId}?replacementStateId=${stateAId}`,
          )
          .set('Cookie', admin2.cookie)
          .set('Origin', ORIGIN),
      ]);

      const statuses = [res1.status, res2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([204, 409]);

      const failRes = res1.status === 409 ? res1 : res2;
      expect(failRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      const states = await e2e.dataSource.query<
        { id: string; deleted_at: string | null }[]
      >(`SELECT id, deleted_at FROM work_item_states WHERE id IN ($1, $2)`, [
        stateAId,
        stateBId,
      ]);
      const liveStates = states.filter((s) => s.deleted_at === null);
      const deletedStates = states.filter((s) => s.deleted_at !== null);
      expect(liveStates.length).toBe(1);
      expect(deletedStates.length).toBe(1);
    });
  });

  describe('AC-32 & AC-43: Work Item Creation vs State Deletion Concurrency', () => {
    it('workspace level Order 1: Create work item locks state SHARE before delete locks WRITE -> delete waits, then moves new work item too', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const stateRes = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Ws Order 1 State', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateId = (stateRes.body as StateMutationResponse).state.id;

      const [todoDefault] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // Open a transaction holding a SHARE lock on the state row to simulate Create holding SHARE lock
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM work_item_states WHERE id = $1 FOR SHARE`,
          [stateId],
        );

        // Start delete request in background (it will wait at X1 for exclusive lock on stateId)
        const deletePromise = http()
          .delete(
            `/api/workspaces/${ws.slug}/states/${stateId}?replacementStateId=${todoDefault.id}`,
          )
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN);

        // Pause to ensure delete request entered transaction and queued at X1
        await new Promise((resolve) => setTimeout(resolve, 50));

        // Create work item targeting stateId (can acquire SHARE since SHARE and SHARE are compatible)
        const createRes = await http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`,
          )
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Created while delete waits',
            description: 'Will be migrated by delete',
            idempotencyKey: crypto.randomUUID(),
            stateId,
          })
          .expect(201);

        const createdWorkItemId = createRes.body.workItem.id as string;
        expect(createRes.body.workItem.stateId).toBe(stateId);

        // Now commit queryRunner transaction, releasing SHARE lock
        await queryRunner.commitTransaction();

        // Delete unblocks, acquires WRITE lock, runs X3 & X4 (migrating the new work item), and commits
        const deleteRes = await deletePromise;
        expect(deleteRes.status).toBe(204);

        // Verify the work item was migrated to replacementStateId
        const wiRows = await e2e.dataSource.query<{ state_id: string }[]>(
          `SELECT state_id FROM work_items WHERE id = $1`,
          [createdWorkItemId],
        );
        expect(wiRows[0].state_id).toBe(todoDefault.id);

        // No live work items remain in target state
        const remaining = await e2e.dataSource.query<{ count: string }[]>(
          `SELECT COUNT(*)::text as count FROM work_items WHERE state_id = $1 AND deleted_at IS NULL`,
          [stateId],
        );
        expect(remaining[0].count).toBe('0');
      } finally {
        await queryRunner.release();
      }
    });

    it('workspace level Order 2: Delete workspace state locks state WRITE before create -> create waits, then sees state soft-deleted -> 409 STATE_UNAVAILABLE', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const stateRes = await http()
        .post(`/api/workspaces/${ws.slug}/states`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Ws Order 2 State', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateId = (stateRes.body as StateMutationResponse).state.id;

      // Open a transaction holding exclusive lock on state row
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM work_item_states WHERE id = $1 FOR UPDATE`,
          [stateId],
        );

        // Start create request in background (it will wait at step 7 for lock on stateId)
        const createPromise = http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`,
          )
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Waiting for delete to finish',
            description: 'Will fail when state deleted',
            idempotencyKey: crypto.randomUUID(),
            stateId,
          });

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Soft-delete state and commit transaction
        await queryRunner.query(
          `UPDATE work_item_states SET deleted_at = NOW() WHERE id = $1`,
          [stateId],
        );
        await queryRunner.commitTransaction();

        // Create unblocks, lockEffectiveState discovers state is soft-deleted, returns 409 STATE_UNAVAILABLE
        const res = await createPromise;
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STATE_UNAVAILABLE');
      } finally {
        await queryRunner.release();
      }
    });

    it('project level Order 1: Create work item arrives before delete project state -> delete waits, then moves new work item too', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const stateRes = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Prj Order 1 State', group: 'active', color: '#7A5CC7' })
        .expect(201);
      const stateId = (stateRes.body as StateMutationResponse).state.id;

      const [todoDefault] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // Open a transaction holding NO KEY UPDATE on project to simulate Create holding project lock
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM projects WHERE id = $1 FOR NO KEY UPDATE`,
          [project.id],
        );

        // Start delete request in background (it will wait at step A1 for SHARE lock on projects)
        const deletePromise = http()
          .delete(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/states/${stateId}?replacementStateId=${todoDefault.id}`,
          )
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN);

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Insert a work item in stateId within queryRunner transaction (simulating create committing its work item)
        const wiId = crypto.randomUUID();
        await insertWorkItem(queryRunner, {
          id: wiId,
          workspaceId: ws.id,
          projectId: project.id,
          stateId,
          number: 1,
          title: 'Order 1 Project Item',
          description: 'Desc',
          createdById: ws.owner.id,
        });

        // Commit queryRunner transaction
        await queryRunner.commitTransaction();

        // Delete unblocks on project, executes X1-X6, and moves the new work item to todoDefault
        const deleteRes = await deletePromise;
        expect(deleteRes.status).toBe(204);

        const wiRows = await e2e.dataSource.query<{ state_id: string }[]>(
          `SELECT state_id FROM work_items WHERE id = $1`,
          [wiId],
        );
        expect(wiRows[0].state_id).toBe(todoDefault.id);

        const remaining = await e2e.dataSource.query<{ count: string }[]>(
          `SELECT COUNT(*)::text as count FROM work_items WHERE state_id = $1 AND deleted_at IS NULL`,
          [stateId],
        );
        expect(remaining[0].count).toBe('0');
      } finally {
        await queryRunner.release();
      }
    });

    it('project level Order 2: Delete project state locks state WRITE before create -> create waits, then sees state soft-deleted -> 409 STATE_UNAVAILABLE', async () => {
      const ws = await seedWorkspace();
      const project = await seedProject(ws);

      const stateRes = await http()
        .post(
          `/api/workspaces/${ws.slug}/projects/${project.identifier}/states`,
        )
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Prj Order 2 State', group: 'active', color: '#7A5CC7' })
        .expect(201);
      const stateId = (stateRes.body as StateMutationResponse).state.id;

      // Open a transaction holding exclusive lock on state row
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM work_item_states WHERE id = $1 FOR UPDATE`,
          [stateId],
        );

        const createPromise = http()
          .post(
            `/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`,
          )
          .set('Cookie', ws.owner.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Waiting for project state delete',
            description: 'Will fail when state deleted',
            idempotencyKey: crypto.randomUUID(),
            stateId,
          });

        await new Promise((resolve) => setTimeout(resolve, 50));

        await queryRunner.query(
          `UPDATE work_item_states SET deleted_at = NOW() WHERE id = $1`,
          [stateId],
        );
        await queryRunner.commitTransaction();

        const res = await createPromise;
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STATE_UNAVAILABLE');
      } finally {
        await queryRunner.release();
      }
    });
  });
});
