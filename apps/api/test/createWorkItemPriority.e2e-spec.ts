import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type PriorityListResponse,
  type WorkItemResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN as ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';

describe('Create Work Item with Priority (e2e)', () => {
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
    const email = `create-wi-prio-${userSeq}@openplany.dev`;
    const id = await createUser(e2e, email, {
      is_superuser: opts.instanceAdmin ?? false,
    });
    return { id, email, cookie: await signInCookie(e2e, email) };
  }

  async function seedWorkspaceAndProject() {
    const wsAdmin = await newUser({ instanceAdmin: true });
    const wsRes = await http()
      .post('/api/workspaces')
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Work Item Prio WS',
        slug: `wi-prio-ws-${userSeq}`,
        organizationSize: '2-10',
      })
      .expect(201);
    const workspaceId = wsRes.body.id as string;
    const workspaceSlug = wsRes.body.slug as string;

    const prjRes = await http()
      .post(`/api/workspaces/${workspaceSlug}/projects`)
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Work Item Prio Project',
        identifier: 'WPP',
        description: 'Description',
        icon: {
          name: DEFAULT_PROJECT_ICON,
          color: DEFAULT_PROJECT_ICON_COLOR,
        },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const projectId = prjRes.body.project.id as string;
    const projectIdentifier = prjRes.body.project.identifier as string;

    const contributor = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [workspaceId, contributor.id],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, 'contributor', 'project', true, now(), now(), now())`,
      [projectId, workspaceId, contributor.id],
    );

    return {
      workspaceId,
      workspaceSlug,
      projectId,
      projectIdentifier,
      contributor,
      wsAdmin,
    };
  }

  it('AC-03: creates work item with default None priority when omitted, or specified priority when provided', async () => {
    const { workspaceSlug, projectIdentifier, contributor } =
      await seedWorkspaceAndProject();

    // Fetch priorities to get IDs of None and High
    const prioRes = await http()
      .get(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities`,
      )
      .set('Cookie', contributor.cookie)
      .expect(200);

    const prios = (prioRes.body as PriorityListResponse).priorities;
    const nonePriority = prios.find((p) => p.band === 'none')!;
    const highPriority = prios.find((p) => p.band === 'high')!;

    // 1. Create without priorityId -> defaults to None (AC-03)
    const key1 = crypto.randomUUID();
    const res1 = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task without priority',
        description: 'Defaults to None',
        idempotencyKey: key1,
      })
      .expect(201);

    const wi1 = res1.body.workItem as WorkItemResponse;
    expect(wi1.priorityId).toBe(nonePriority.id);

    // Verify DB
    const [row1] = await e2e.dataSource.query<{ priority_id: string }[]>(
      `SELECT priority_id FROM work_items WHERE id = $1`,
      [wi1.id],
    );
    expect(row1!.priority_id).toBe(nonePriority.id);

    // 2. Create with High priorityId -> sets to High (AC-03)
    const key2 = crypto.randomUUID();
    const res2 = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Urgent task',
        description: 'Explicitly High',
        idempotencyKey: key2,
        priorityId: highPriority.id,
      })
      .expect(201);

    const wi2 = res2.body.workItem as WorkItemResponse;
    expect(wi2.priorityId).toBe(highPriority.id);

    // Verify DB
    const [row2] = await e2e.dataSource.query<{ priority_id: string }[]>(
      `SELECT priority_id FROM work_items WHERE id = $1`,
      [wi2.id],
    );
    expect(row2!.priority_id).toBe(highPriority.id);
  });

  it('AC-07: returns 409 PRIORITY_UNAVAILABLE for non-existent priorityId without modifying counter', async () => {
    const { workspaceSlug, projectIdentifier, contributor, projectId } =
      await seedWorkspaceAndProject();

    const initialProject = (
      await e2e.dataSource.query<{ last_work_item_number: number }[]>(
        `SELECT last_work_item_number FROM projects WHERE id = $1`,
        [projectId],
      )
    )[0]!;
    expect(initialProject.last_work_item_number).toBe(0);

    const randomId = crypto.randomUUID();
    const res = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with invalid priority',
        idempotencyKey: crypto.randomUUID(),
        priorityId: randomId,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PRIORITY_UNAVAILABLE');

    // Verify no work item created and counter unchanged
    const count = await e2e.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM work_items WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(count[0]!.count)).toBe(0);

    const currentProject = (
      await e2e.dataSource.query<{ last_work_item_number: number }[]>(
        `SELECT last_work_item_number FROM projects WHERE id = $1`,
        [projectId],
      )
    )[0]!;
    expect(currentProject.last_work_item_number).toBe(0);
  });

  it('AC-10, INV-06: replaying with same idempotency key and same title/desc returns 200 with original priority even if priorityId differs', async () => {
    const { workspaceSlug, projectIdentifier, contributor } =
      await seedWorkspaceAndProject();

    const prioRes = await http()
      .get(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities`,
      )
      .set('Cookie', contributor.cookie)
      .expect(200);

    const prios = (prioRes.body as PriorityListResponse).priorities;
    const highPriority = prios.find((p) => p.band === 'high')!;
    const lowPriority = prios.find((p) => p.band === 'low')!;

    const key = crypto.randomUUID();

    // 1. First creation with High priority
    const res1 = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Idempotency test',
        description: 'Same body',
        idempotencyKey: key,
        priorityId: highPriority.id,
      })
      .expect(201);

    expect(res1.body.workItem.priorityId).toBe(highPriority.id);

    // 2. Replay with Low priority: returns 200 with original High priority (INV-06)
    const res2 = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Idempotency test',
        description: 'Same body',
        idempotencyKey: key,
        priorityId: lowPriority.id,
      })
      .expect(200);

    expect(res2.body.workItem.id).toBe(res1.body.workItem.id);
    expect(res2.body.workItem.priorityId).toBe(highPriority.id);
  });
});
