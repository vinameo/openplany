import crypto from 'node:crypto';
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
  type StateListResponse,
  type WorkItemResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  signInCookie,
  DEFAULT_E2E_ORIGIN as ORIGIN,
} from './helpers/e2eUsers.js';

describe('Work Item State Tracer (e2e)', () => {
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
    const email = `state-wi-user-${userSeq}@openplany.dev`;
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

  async function getDefaultBacklogId(): Promise<string> {
    const rows = await e2e.dataSource.query<{ id: string }[]>(
      `SELECT id FROM work_item_states WHERE level = 'default' AND default_key = 'backlog'`,
    );
    return rows[0].id;
  }

  async function insertProjectState(
    wsId: string,
    projectId: string,
    opts: {
      name: string;
      group?: 'backlog' | 'planned' | 'active' | 'finished' | 'cancelled';
      color?: string;
    },
  ): Promise<string> {
    const rows = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_states
        (level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
       VALUES
        ('project', $1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [
        wsId,
        projectId,
        opts.name,
        opts.group ?? 'active',
        opts.color ?? '#7A5CC7',
      ],
    );
    return rows[0].id;
  }

  it('AC-05: GET /api/workspaces/:slug/projects/:identifier/states returns canonical ordered states and metadata', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);

    // Insert a custom project state
    const reviewId = await insertProjectState(ws.id, project.id, {
      name: 'In Review',
      group: 'active',
    });

    const res = await http()
      .get(`/api/workspaces/${ws.slug}/projects/${project.identifier}/states`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .expect(200);

    const body = res.body as StateListResponse;
    expect(body.initialStateId).toBe(await getDefaultBacklogId());
    expect(body.ownCount).toBe(1);
    expect(body.ownMax).toBe(50);

    // Order: default < workspace < project; groups order: backlog, planned, active, finished, cancelled
    expect(body.states).toHaveLength(6);
    expect(body.states[0].name).toBe('Backlog');
    expect(body.states[0].group).toBe('backlog');
    expect(body.states[0].level).toBe('default');

    const reviewState = body.states.find((s) => s.id === reviewId);
    expect(reviewState).toBeDefined();
    expect(reviewState?.name).toBe('In Review');
    expect(reviewState?.group).toBe('active');
    expect(reviewState?.level).toBe('project');
  });

  it('AC-28: creates work item without stateId defaulting to Backlog, and with stateId creating at specified state', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);
    const backlogId = await getDefaultBacklogId();

    // 1. Without stateId -> defaults to Backlog
    const res1 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task in Backlog',
        description: 'No state specified',
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(201);

    const wi1 = res1.body.workItem as WorkItemResponse;
    expect(wi1.number).toBe(1);
    expect(wi1.stateId).toBe(backlogId);

    // 2. With stateId = Review -> created at Review
    const reviewId = await insertProjectState(ws.id, project.id, {
      name: 'Code Review',
      group: 'active',
    });

    const res2 = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task in Review',
        description: 'Review state specified',
        idempotencyKey: crypto.randomUUID(),
        stateId: reviewId,
      })
      .expect(201);

    const wi2 = res2.body.workItem as WorkItemResponse;
    expect(wi2.number).toBe(2);
    expect(wi2.stateId).toBe(reviewId);
  });

  it('AC-29: returns 409 STATE_UNAVAILABLE when requested state was soft-deleted before Save', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);

    const reviewId = await insertProjectState(ws.id, project.id, {
      name: 'To Delete',
      group: 'active',
    });

    // Directly soft-delete the state in DB
    await e2e.dataSource.query(
      `UPDATE work_item_states SET deleted_at = NOW() WHERE id = $1`,
      [reviewId],
    );

    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with Deleted State',
        description: 'Should fail with 409',
        idempotencyKey: crypto.randomUUID(),
        stateId: reviewId,
      })
      .expect(409);

    expect(res.body.code).toBe('STATE_UNAVAILABLE');

    // Counter must NOT be incremented
    const countRows = await e2e.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*)::text as count FROM work_items WHERE project_id = $1`,
      [project.id],
    );
    expect(countRows[0].count).toBe('0');
  });

  it('AC-30: returns 409 STATE_UNAVAILABLE when requested state belongs to another project', async () => {
    const ws = await seedWorkspace();
    const project1 = await seedProject(ws, 'Project 1', 'P1');
    const project2 = await seedProject(ws, 'Project 2', 'P2');

    const project2StateId = await insertProjectState(ws.id, project2.id, {
      name: 'P2 Specific State',
      group: 'active',
    });

    // Attempt to use project2's state in project1
    const res = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project1.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with Alien State',
        description: 'Should fail with 409',
        idempotencyKey: crypto.randomUUID(),
        stateId: project2StateId,
      })
      .expect(409);

    expect(res.body.code).toBe('STATE_UNAVAILABLE');
  });

  it('AC-33: replay with same idempotency key and same content returns old work item even if stateId differs', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);
    const backlogId = await getDefaultBacklogId();

    const reviewId = await insertProjectState(ws.id, project.id, {
      name: 'Review',
      group: 'active',
    });

    const key = crypto.randomUUID();

    // 1. Initial creation with Backlog (omitted stateId)
    const initialRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Original Title',
        description: 'Original Description',
        idempotencyKey: key,
      })
      .expect(201);

    expect(initialRes.status).toBe(201);
    expect(initialRes.body.workItem.stateId).toBe(backlogId);

    // 2. Replay with same key, same Title & Description, but different stateId
    const replayRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Original Title',
        description: 'Original Description',
        idempotencyKey: key,
        stateId: reviewId, // Different state
      })
      .expect(200);

    // Returns original work item with its original stateId
    expect(replayRes.body.workItem.id).toBe(initialRes.body.workItem.id);
    expect(replayRes.body.workItem.stateId).toBe(backlogId);

    // 3. Replay with same key but DIFFERENT title -> 409 WORK_ITEM_REQUEST_REUSED
    const conflictRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Tampered Title',
        description: 'Original Description',
        idempotencyKey: key,
      })
      .expect(409);

    expect(conflictRes.body.code).toBe('WORK_ITEM_REQUEST_REUSED');
  });

  it('AC-35: actor without project.states.view is forbidden on GET /states but can create work items in Backlog', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);

    // Create a regular user and add to workspace & project as contributor
    const contributor = await newUser();
    await addMember(ws.id, project.id, contributor, 'contributor');

    // Remove project.states.view from contributor role
    await e2e.dataSource.query(
      `DELETE FROM role_permissions
       WHERE scope = 'project' AND role_key = 'contributor' AND permission_key = 'project.states.view'`,
    );

    // 1. GET /states returns 403 FORBIDDEN
    const statesRes = await http()
      .get(`/api/workspaces/${ws.slug}/projects/${project.identifier}/states`)
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .expect(403);

    expect(statesRes.body.code).toBe('FORBIDDEN');

    // 2. POST /work-items without stateId succeeds and creates in Backlog
    const backlogId = await getDefaultBacklogId();
    const createRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Created by Contributor',
        description: 'No state view permission needed',
        idempotencyKey: crypto.randomUUID(),
      })
      .expect(201);

    expect(createRes.body.workItem.stateId).toBe(backlogId);
  });

  it('AC-41: replay with same key and same content after state was soft-deleted returns old work item (200 OK)', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);

    const customStateId = await insertProjectState(ws.id, project.id, {
      name: 'Custom Sprint State',
      group: 'active',
    });

    const key = crypto.randomUUID();

    // 1. Create work item at custom state
    const initialRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with Custom State',
        description: 'Before state deletion',
        idempotencyKey: key,
        stateId: customStateId,
      })
      .expect(201);

    expect(initialRes.body.workItem.stateId).toBe(customStateId);

    // 2. Directly soft-delete the state
    await e2e.dataSource.query(
      `UPDATE work_item_states SET deleted_at = NOW() WHERE id = $1`,
      [customStateId],
    );

    // 3. Replay with same key and same content
    const replayRes = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
      .set('Cookie', ws.owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with Custom State',
        description: 'Before state deletion',
        idempotencyKey: key,
      })
      .expect(200);

    expect(replayRes.status).toBe(200);
    expect(replayRes.body.workItem.id).toBe(initialRes.body.workItem.id);
    expect(replayRes.body.workItem.stateId).toBe(customStateId);
  });

  it('AC-43 & AC-32: concurrent create waiting for lock on state being deleted fails with 409 STATE_UNAVAILABLE', async () => {
    const ws = await seedWorkspace();
    const project = await seedProject(ws);

    const stateId = await insertProjectState(ws.id, project.id, {
      name: 'Under Deletion',
      group: 'active',
    });

    // Open an explicit transaction that holds exclusive lock on the state row
    const queryRunner = e2e.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the state for update
      await queryRunner.query(
        `SELECT id FROM work_item_states WHERE id = $1 FOR UPDATE`,
        [stateId],
      );

      // Start the work item creation request in the background (it will wait for lock on the state row)
      const createPromise = http()
        .post(`/api/workspaces/${ws.slug}/projects/${project.identifier}/work-items`)
        .set('Cookie', ws.owner.cookie)
        .set('Origin', ORIGIN)
        .send({
          title: 'Concurrent Create Waiting',
          description: 'Will fail when lock released and state is deleted',
          idempotencyKey: crypto.randomUUID(),
          stateId,
        });

      // Small pause to let the HTTP request enter the TypeORM transaction and queue for lock
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Soft delete the state and commit the transaction
      await queryRunner.query(
        `UPDATE work_item_states SET deleted_at = NOW() WHERE id = $1`,
        [stateId],
      );
      await queryRunner.commitTransaction();

      // The create request unblocks, re-evaluates `where: { deletedAt: IsNull() }`,
      // discovers the row is soft-deleted, and returns 409 STATE_UNAVAILABLE
      const res = await createPromise;
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('STATE_UNAVAILABLE');
    } finally {
      await queryRunner.release();
    }
  });
});
