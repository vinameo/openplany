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

describe('Project States API (e2e)', () => {
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
    const email = `state-user-${userSeq}@openplany.dev`;
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
        name: 'States Workspace',
        slug: `states-ws-${userSeq}`,
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
        name: 'States Project',
        identifier: 'STP',
        description: 'States Project Description',
        icon: {
          name: DEFAULT_PROJECT_ICON,
          color: DEFAULT_PROJECT_ICON_COLOR,
        },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const projectId = prjRes.body.project.id as string;
    const projectIdentifier = prjRes.body.project.identifier as string;

    return {
      workspaceId,
      workspaceSlug,
      projectId,
      projectIdentifier,
      wsAdmin,
    };
  }

  async function addProjectMember(
    workspaceId: string,
    projectId: string,
    userId: string,
    role: 'admin' | 'contributor' | 'commenter' | 'viewer',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())
       ON CONFLICT (workspace_id, member_id) DO NOTHING`,
      [workspaceId, userId],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'project', true, now(), now())`,
      [projectId, workspaceId, userId, role],
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

  describe('Permissions and roles (AC-13)', () => {
    it('Contributor is forbidden (403) while Project Admin and Workspace Admin succeed (201/200)', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      const contributor = await newUser();
      await addProjectMember(
        workspaceId,
        projectId,
        contributor.id,
        'contributor',
      );

      const projectAdmin = await newUser();
      await addProjectMember(workspaceId, projectId, projectAdmin.id, 'admin');

      // Contributor cannot create project state
      await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', contributor.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Contributor State',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(403);

      // Project Admin can create project state
      const createdRes = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', projectAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'PA State',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);

      const stateId = (createdRes.body as StateMutationResponse).state.id;

      // Contributor cannot patch project state
      await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', contributor.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Hacked Name',
        })
        .expect(403);

      // Workspace Admin can also patch project state
      const patchRes = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Updated by WS Admin',
        })
        .expect(200);

      expect((patchRes.body as StateMutationResponse).state.name).toBe(
        'Updated by WS Admin',
      );
    });
  });

  describe('Response shape (INV-12)', () => {
    it('returns only fields of StateResponse without internal columns', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Shape Test',
          group: 'active',
          color: '#E08A1E',
        })
        .expect(201);

      const body = res.body as StateMutationResponse;
      expect(body.state).toBeDefined();
      expect(body.state.name).toBe('Shape Test');
      expect(body.state.group).toBe('active');
      expect(body.state.color).toBe('#E08A1E');
      expect(body.state.level).toBe('project');
      expect(body.state.workItemCount).toBe(0);

      const keys = Object.keys(body.state);
      expect(keys.sort()).toEqual([
        'color',
        'group',
        'id',
        'level',
        'name',
        'workItemCount',
      ]);

      // Raw DB fields must not leak
      const rawState = body.state as unknown as Record<string, unknown>;
      expect(rawState.workspaceId).toBeUndefined();
      expect(rawState.projectId).toBeUndefined();
      expect(rawState.defaultKey).toBeUndefined();
      expect(rawState.createdById).toBeUndefined();
      expect(rawState.updatedById).toBeUndefined();
      expect(rawState.deletedAt).toBeUndefined();
    });
  });

  describe('workItemCount visibility (AC-06)', () => {
    it('shows workItemCount to manager and hides it from contributor on GET', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      const contributor = await newUser();
      await addProjectMember(
        workspaceId,
        projectId,
        contributor.id,
        'contributor',
      );

      // Admin GET
      const adminGet = await http()
        .get(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const adminBody = adminGet.body as StateListResponse;
      for (const s of adminBody.states) {
        expect(s.workItemCount).toBeDefined();
        expect(typeof s.workItemCount).toBe('number');
      }

      // Contributor GET
      const contributorGet = await http()
        .get(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', contributor.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const contribBody = contributorGet.body as StateListResponse;
      for (const s of contribBody.states) {
        expect(s.workItemCount).toBeUndefined();
      }
    });
  });

  describe('Name uniqueness and collisions (INV-06, AC-20, AC-46)', () => {
    it('rejects adding state with name matching default state (case-insensitive)', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: '  bAcKlOg  ',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN');
      expect(res.body.fields?.name).toBe(
        'A state with this name already exists.',
      );
    });

    it('rejects adding state with name matching workspace state (AC-20)', async () => {
      const { workspaceId, workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // Seed a workspace state "QA"
      await e2e.dataSource.query(
        `INSERT INTO work_item_states (id, level, workspace_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'workspace', $1, 'QA', 'active', '#2F9E6E', now(), now())`,
        [workspaceId],
      );

      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'qa',
          group: 'active',
          color: '#2F9E6E',
        })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN');
    });

    it('allows renaming own state changing only case (API B4)', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const created = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Review',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);

      const stateId = (created.body as StateMutationResponse).state.id;

      const res = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'REVIEW',
        })
        .expect(200);

      expect((res.body as StateMutationResponse).state.name).toBe('REVIEW');
    });

    it('rejects renaming own state to another existing state in project (AC-46)', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Alpha',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);

      const beta = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Beta',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);

      const betaId = (beta.body as StateMutationResponse).state.id;

      const res = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${betaId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'alpha',
        })
        .expect(409);

      expect(res.body.code).toBe('STATE_NAME_TAKEN');
    });
  });

  describe('Own-level target scoping (INV-03, AC-08, AC-09, AC-10)', () => {
    it('returns 404 STATE_NOT_FOUND when patching default state id (AC-08)', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const [defaultRow] = await e2e.dataSource.query<{ id: string }[]>(
        "SELECT id FROM work_item_states WHERE level = 'default' LIMIT 1",
      );

      const res = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${defaultRow!.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Patched Default',
        })
        .expect(404);

      expect(res.body.code).toBe('STATE_NOT_FOUND');
    });

    it('returns 404 STATE_NOT_FOUND when patching workspace state id via project route (AC-09)', async () => {
      const { workspaceId, workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const [wsRow] = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (id, level, workspace_id, name, state_group, color, created_at, updated_at)
         VALUES (gen_random_uuid(), 'workspace', $1, 'Workspace State', 'active', '#2F9E6E', now(), now())
         RETURNING id`,
        [workspaceId],
      );

      const res = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${wsRow!.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Patched WS State',
        })
        .expect(404);

      expect(res.body.code).toBe('STATE_NOT_FOUND');
    });

    it('returns 404 STATE_NOT_FOUND for non-existent UUID or malformed id (AC-10)', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // Random UUID
      const randomUuid = '00000000-0000-4000-8000-000000000000';
      const resRandom = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${randomUuid}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Random' })
        .expect(404);
      expect(resRandom.body.code).toBe('STATE_NOT_FOUND');

      // Malformed ID
      const resMalformed = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/not-a-uuid`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Malformed' })
        .expect(404);
      expect(resMalformed.body.code).toBe('STATE_NOT_FOUND');
    });
  });

  describe('50 states limit (INV-07, AC-22)', () => {
    it('rejects creating 51st state with 409 PROJECT_STATE_LIMIT_REACHED', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      // Seed 50 project states directly in DB
      for (let i = 1; i <= 50; i++) {
        await e2e.dataSource.query(
          `INSERT INTO work_item_states (id, level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
           VALUES (gen_random_uuid(), 'project', $1, $2, $3, 'active', '#2F9E6E', now(), now())`,
          [workspaceId, projectId, `State ${i}`],
        );
      }

      // 51st attempt fails
      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'State 51',
          group: 'active',
          color: '#2F9E6E',
        })
        .expect(409);

      expect(res.body.code).toBe('PROJECT_STATE_LIMIT_REACHED');
      expect(res.body.message).toContain('50');
    });
  });

  describe('Group change with live work items (INV-19, AC-39, AC-42, AC-47)', () => {
    it('changes group immediately when state has 0 work items', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      const created = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Testing Group',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);

      const stateId = (created.body as StateMutationResponse).state.id;

      const patched = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          group: 'active',
        })
        .expect(200);

      expect((patched.body as StateMutationResponse).state.group).toBe(
        'active',
      );
    });

    it('requires confirmGroupChange when state has live work items', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      const created = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Has Work Items',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);

      const stateId = (created.body as StateMutationResponse).state.id;

      // Seed 3 live work items in this state
      for (let i = 1; i <= 3; i++) {
        await e2e.dataSource.query(
          `INSERT INTO work_items (id, workspace_id, project_id, number, title, description, state_id, idempotency_key, created_by_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, '', $5, gen_random_uuid(), $6, now(), now())`,
          [workspaceId, projectId, i, `Item ${i}`, stateId, wsAdmin.id],
        );
      }

      // Attempt to change group without confirmation fails with 409 and count: 3
      const failRes = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          group: 'active',
        })
        .expect(409);

      expect(failRes.body.code).toBe('STATE_GROUP_CHANGE_UNCONFIRMED');
      expect(failRes.body.count).toBe(3);

      // Attempt with confirmGroupChange: true succeeds
      const okRes = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          group: 'active',
          confirmGroupChange: true,
        })
        .expect(200);

      expect((okRes.body as StateMutationResponse).state.group).toBe('active');
      expect((okRes.body as StateMutationResponse).state.workItemCount).toBe(3);
    });
  });

  describe('Rate limiting (API B2.1, AC-44)', () => {
    it('enforces 60 state write requests per window and returns 429 without decrementing general workspace writes', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // 1st write: create a state
      const created = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Rate Base',
          group: 'active',
          color: '#2F9E6E',
        })
        .expect(201);

      const stateId = (created.body as StateMutationResponse).state.id;

      // 59 more writes: patch color repeatedly (total 60 writes)
      for (let i = 2; i <= 60; i++) {
        const color = i % 2 === 0 ? '#3E7BD6' : '#2F9E6E';
        await http()
          .patch(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
          )
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN)
          .send({ color })
          .expect(200);
      }

      // 61st write must be rate limited with 429
      const limited = await http()
        .patch(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ color: '#E08A1E' })
        .expect(429);

      expect(limited.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(limited.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(limited.headers['retry-after']).toBeDefined();

      // AC-44: General workspace write limiter is NOT decremented by state writes
      await http()
        .patch(`/api/workspaces/${workspaceSlug}`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Still Editable Workspace' })
        .expect(200);
    });
  });
});
