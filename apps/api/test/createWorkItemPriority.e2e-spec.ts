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

  it('AC-07: returns 409 PRIORITY_UNAVAILABLE for unavailable priorities (other project, other workspace, soft-deleted, random UUID, state id) without modifying counter', async () => {
    const {
      workspaceId,
      workspaceSlug,
      projectIdentifier,
      contributor,
      projectId,
      wsAdmin,
    } = await seedWorkspaceAndProject();

    // 1. Create project Q in same workspace
    const prjQRes = await http()
      .post(`/api/workspaces/${workspaceSlug}/projects`)
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Project Q',
        identifier: 'PRQ',
        description: 'Project Q Description',
        icon: {
          name: DEFAULT_PROJECT_ICON,
          color: DEFAULT_PROJECT_ICON_COLOR,
        },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const projectQId = prjQRes.body.project.id as string;

    // 2. Create another workspace W2
    const ws2Res = await http()
      .post('/api/workspaces')
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Workspace Two',
        slug: `ws-two-${userSeq}`,
        organizationSize: '2-10',
      })
      .expect(201);
    const workspace2Id = ws2Res.body.id as string;

    // Insert test priorities directly in DB:
    // (a) Project priority of project Q (same workspace, different project)
    const [prioProjQ] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES ('project', $1, $2, 'Q Priority', 'medium', '#E08A1E', now(), now()) RETURNING id`,
      [workspaceId, projectQId],
    );

    // (b) Workspace priority of workspace W2 (different workspace)
    const [prioWs2] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES ('workspace', $1, 'W2 Priority', 'high', '#D0642B', now(), now()) RETURNING id`,
      [workspace2Id],
    );

    // (c) Soft-deleted priority of project P
    const [prioDeleted] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at, deleted_at)
       VALUES ('project', $1, $2, 'Deleted Priority', 'low', '#3E7BD6', now(), now(), now()) RETURNING id`,
      [workspaceId, projectId],
    );

    // (d) Random UUID
    const randomUuid = crypto.randomUUID();

    // (e) ID of a state (from work_item_states table)
    const [stateRow] = await e2e.dataSource.query<{ id: string }[]>(
      `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
    );
    const stateIdAsPriority = stateRow!.id;

    const unavailableCases = [
      { name: 'other project', id: prioProjQ!.id },
      { name: 'other workspace', id: prioWs2!.id },
      { name: 'soft-deleted', id: prioDeleted!.id },
      { name: 'random UUID', id: randomUuid },
      { name: 'state id', id: stateIdAsPriority },
    ];

    for (const testCase of unavailableCases) {
      const initialProject = (
        await e2e.dataSource.query<{ last_work_item_number: number }[]>(
          `SELECT last_work_item_number FROM projects WHERE id = $1`,
          [projectId],
        )
      )[0]!;

      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
        )
        .set('Cookie', contributor.cookie)
        .set('Origin', ORIGIN)
        .send({
          title: `Task with unavailable priority (${testCase.name})`,
          idempotencyKey: crypto.randomUUID(),
          priorityId: testCase.id,
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('PRIORITY_UNAVAILABLE');

      // Verify no work item created and counter unchanged
      const currentProject = (
        await e2e.dataSource.query<{ last_work_item_number: number }[]>(
          `SELECT last_work_item_number FROM projects WHERE id = $1`,
          [projectId],
        )
      )[0]!;
      expect(currentProject.last_work_item_number).toBe(
        initialProject.last_work_item_number,
      );
    }

    const count = await e2e.dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM work_items WHERE project_id = $1`,
      [projectId],
    );
    expect(Number(count[0]!.count)).toBe(0);
  });

  it('AC-08, API B4: creates work item with valid workspace priority, project priority, or mixed-case UUID', async () => {
    const {
      workspaceId,
      workspaceSlug,
      projectIdentifier,
      contributor,
      projectId,
    } = await seedWorkspaceAndProject();

    // 1. Create workspace-level priority directly in DB
    const [wsPriority] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES ('workspace', $1, 'Ws Urgent', 'urgent', '#B05A5A', now(), now()) RETURNING id`,
      [workspaceId],
    );

    // 2. Create project-level priority directly in DB
    const [prjPriority] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES ('project', $1, $2, 'Prj Low', 'low', '#3E7BD6', now(), now()) RETURNING id`,
      [workspaceId, projectId],
    );

    // Create work item with workspace priority
    const resWs = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with ws priority',
        idempotencyKey: crypto.randomUUID(),
        priorityId: wsPriority!.id,
      })
      .expect(201);

    expect(resWs.body.workItem.priorityId).toBe(wsPriority!.id);

    // Create work item with project priority
    const resPrj = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with prj priority',
        idempotencyKey: crypto.randomUUID(),
        priorityId: prjPriority!.id,
      })
      .expect(201);

    expect(resPrj.body.workItem.priorityId).toBe(prjPriority!.id);

    // Create work item with mixed-case UUID of valid priority (API B4: Postgres uuid comparison is case-insensitive)
    const upperUuid = prjPriority!.id.toUpperCase();
    const resUpper = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task with mixed case priority UUID',
        idempotencyKey: crypto.randomUUID(),
        priorityId: upperUuid,
      })
      .expect(201);

    expect(resUpper.body.workItem.priorityId).toBe(prjPriority!.id);
  });

  it('AC-10, INV-06: replaying with same key and same title/desc returns 200 with original priority; different title returns 409 WORK_ITEM_REQUEST_REUSED', async () => {
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

    // 3. Replay with different title -> 409 WORK_ITEM_REQUEST_REUSED (AC-10)
    const res3 = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Different Title',
        description: 'Same body',
        idempotencyKey: key,
        priorityId: lowPriority.id,
      });

    expect(res3.status).toBe(409);
    expect(res3.body.code).toBe('WORK_ITEM_REQUEST_REUSED');
  });

  it('AC-19, RQ D11: returns 409 STATE_UNAVAILABLE when both stateId and priorityId are unavailable; PRIORITY_UNAVAILABLE when only priorityId is unavailable', async () => {
    const { workspaceSlug, projectIdentifier, contributor } =
      await seedWorkspaceAndProject();

    const badStateId = crypto.randomUUID();
    const badPriorityId = crypto.randomUUID();

    // 1. Both state and priority invalid -> step 7a runs first -> 409 STATE_UNAVAILABLE (D11, AC-19)
    const resBoth = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Both state and priority invalid',
        idempotencyKey: crypto.randomUUID(),
        stateId: badStateId,
        priorityId: badPriorityId,
      });

    expect(resBoth.status).toBe(409);
    expect(resBoth.body.code).toBe('STATE_UNAVAILABLE');

    // 2. Valid state, invalid priority -> 409 PRIORITY_UNAVAILABLE
    const [validState] = await e2e.dataSource.query<{ id: string }[]>(
      `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
    );

    const resPrioOnly = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Only priority invalid',
        idempotencyKey: crypto.randomUUID(),
        stateId: validState!.id,
        priorityId: badPriorityId,
      });

    expect(resPrioOnly.status).toBe(409);
    expect(resPrioOnly.body.code).toBe('PRIORITY_UNAVAILABLE');
  });

  it('AC-28, RQ D29: user lacking project.workitems.view can still create work item with specified priorityId (needs only project.workitems.create)', async () => {
    const { workspaceSlug, projectIdentifier, contributor } =
      await seedWorkspaceAndProject();

    // Revoke project.workitems.view from contributor role in database
    await e2e.dataSource.query(
      `DELETE FROM role_permissions WHERE scope = 'project' AND role_key = 'contributor' AND permission_key = 'project.workitems.view'`,
    );

    const [highPriority] = await e2e.dataSource.query<{ id: string }[]>(
      `SELECT id FROM work_item_priorities WHERE default_key = 'high'`,
    );

    // Contributor creates work item with High priorityId
    const res = await http()
      .post(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
      )
      .set('Cookie', contributor.cookie)
      .set('Origin', ORIGIN)
      .send({
        title: 'Task created without view permission',
        idempotencyKey: crypto.randomUUID(),
        priorityId: highPriority!.id,
      })
      .expect(201);

    expect(res.body.workItem.priorityId).toBe(highPriority!.id);

    // Verify row in database
    const [row] = await e2e.dataSource.query<{ priority_id: string }[]>(
      `SELECT priority_id FROM work_items WHERE id = $1`,
      [res.body.workItem.id],
    );
    expect(row!.priority_id).toBe(highPriority!.id);
  });

  describe('AC-18, INV-05: Work Item Creation vs Priority Soft-Deletion Concurrency', () => {
    it('Order 1: Creation request holds SHARE lock before deletion locks FOR UPDATE -> deletion waits until creation commits', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectIdentifier,
        contributor,
        projectId,
      } = await seedWorkspaceAndProject();

      // Create a custom project priority
      const [customPriority] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
         VALUES ('project', $1, $2, 'Order 1 Custom Priority', 'medium', '#E08A1E', now(), now()) RETURNING id`,
        [workspaceId, projectId],
      );

      // Open a transaction holding SHARE lock on customPriority to simulate creation transaction holding SHARE lock
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM work_item_priorities WHERE id = $1 FOR SHARE`,
          [customPriority!.id],
        );

        // Background queryRunner attempting to delete the priority with FOR UPDATE
        const deleteRunner = e2e.dataSource.createQueryRunner();
        await deleteRunner.connect();
        await deleteRunner.startTransaction();

        let deleteStarted = false;
        let deleteFinished = false;

        const deletePromise = (async () => {
          deleteStarted = true;
          await deleteRunner.query(
            `SELECT id FROM work_item_priorities WHERE id = $1 FOR UPDATE`,
            [customPriority!.id],
          );
          await deleteRunner.query(
            `UPDATE work_item_priorities SET deleted_at = now() WHERE id = $1`,
            [customPriority!.id],
          );
          await deleteRunner.commitTransaction();
          deleteFinished = true;
        })();

        // Wait to ensure delete query entered and is blocked waiting for SHARE lock
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(deleteStarted).toBe(true);
        expect(deleteFinished).toBe(false);

        // Create work item targeting customPriority (can acquire SHARE since SHARE and SHARE are compatible)
        const createRes = await http()
          .post(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
          )
          .set('Cookie', contributor.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Created while delete waits',
            idempotencyKey: crypto.randomUUID(),
            priorityId: customPriority!.id,
          })
          .expect(201);

        expect(createRes.body.workItem.priorityId).toBe(customPriority!.id);

        // Delete is still waiting because queryRunner is holding SHARE lock
        expect(deleteFinished).toBe(false);

        // Commit queryRunner transaction, releasing SHARE lock
        await queryRunner.commitTransaction();

        // Now delete transaction can acquire FOR UPDATE and finish
        await deletePromise;
        expect(deleteFinished).toBe(true);

        await deleteRunner.release();
      } finally {
        await queryRunner.release();
      }
    });

    it('Order 2: Deletion locks FOR UPDATE before creation arrives -> creation waits at step 7b, sees soft-deleted priority -> 409 PRIORITY_UNAVAILABLE', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectIdentifier,
        contributor,
        projectId,
      } = await seedWorkspaceAndProject();

      // Create a custom project priority
      const [customPriority] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
         VALUES ('project', $1, $2, 'Order 2 Custom Priority', 'high', '#D0642B', now(), now()) RETURNING id`,
        [workspaceId, projectId],
      );

      // Open a transaction holding exclusive FOR UPDATE lock on the custom priority row
      const queryRunner = e2e.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        await queryRunner.query(
          `SELECT id FROM work_item_priorities WHERE id = $1 FOR UPDATE`,
          [customPriority!.id],
        );

        // Start work item creation in background (it will wait at step 7b for lock on priority)
        const createPromise = http()
          .post(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
          )
          .set('Cookie', contributor.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Waiting for priority delete to finish',
            idempotencyKey: crypto.randomUUID(),
            priorityId: customPriority!.id,
          });

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Soft-delete the priority and commit the transaction
        await queryRunner.query(
          `UPDATE work_item_priorities SET deleted_at = NOW() WHERE id = $1`,
          [customPriority!.id],
        );
        await queryRunner.commitTransaction();

        // Creation unblocks, lockEffectivePriority evaluates WHERE on the updated row (deleted_at IS NOT NULL) -> returns null -> 409 PRIORITY_UNAVAILABLE
        const res = await createPromise;
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PRIORITY_UNAVAILABLE');
      } finally {
        await queryRunner.release();
      }
    });
  });
});
