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

  describe('DELETE /api/workspaces/:slug/projects/:identifier/states/:stateId', () => {
    it('AC-23: deletes empty state without replacementStateId (204), sets deleted_at, disappears from GET, name can be recreated', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // Create a state
      const createRes = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'To Be Deleted',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);

      const stateId = (createRes.body as StateMutationResponse).state.id;

      // DELETE without replacement
      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Verify row is soft deleted in DB
      const [row] = await e2e.dataSource.query<
        { deleted_at: Date | null; deleted_by_id: string | null }[]
      >(
        `SELECT deleted_at, deleted_by_id FROM work_item_states WHERE id = $1`,
        [stateId],
      );
      expect(row.deleted_at).not.toBeNull();
      expect(row.deleted_by_id).toBe(wsAdmin.id);

      // Disappears from GET
      const listRes = await http()
        .get(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(200);

      const states = (listRes.body as StateListResponse).states;
      expect(states.find((s) => s.id === stateId)).toBeUndefined();
      expect((listRes.body as StateListResponse).ownCount).toBe(0);

      // Name can be recreated (AC-23)
      await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'To Be Deleted',
          group: 'planned',
          color: '#5B6B82',
        })
        .expect(201);
    });

    it('AC-08, AC-09, AC-10: returns uniform 404 STATE_NOT_FOUND for default, workspace, another project, deleted, or random/invalid ID', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      // 1. Default state ID (AC-08)
      const [defaultRow] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE level = 'default' LIMIT 1`,
      );
      const defRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${defaultRow.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(defRes.body.code).toBe('STATE_NOT_FOUND');

      // 2. Workspace state ID (AC-09)
      const wsStateRes = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (level, workspace_id, name, state_group, color, created_at, updated_at)
         VALUES ('workspace', $1, 'WS State', 'active', '#2F9E6E', now(), now())
         RETURNING id`,
        [workspaceId],
      );
      const wsStateId = wsStateRes[0].id;

      const wsRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${wsStateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(wsRes.body.code).toBe('STATE_NOT_FOUND');

      // 3. Another project state ID (AC-10)
      const otherProjectRes = await http()
        .post(`/api/workspaces/${workspaceSlug}/projects`)
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Other Project',
          identifier: 'OTP',
          description: 'Other Project Description',
          icon: {
            name: DEFAULT_PROJECT_ICON,
            color: DEFAULT_PROJECT_ICON_COLOR,
          },
          coverKey: DEFAULT_PROJECT_COVER,
        })
        .expect(201);
      const otherPrjId = otherProjectRes.body.project.id as string;

      const otherStateRes = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (level, workspace_id, project_id, name, state_group, color, created_at, updated_at)
         VALUES ('project', $1, $2, 'Other Prj State', 'active', '#2F9E6E', now(), now())
         RETURNING id`,
        [workspaceId, otherPrjId],
      );
      const otherStateId = otherStateRes[0].id;

      const otherRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${otherStateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(otherRes.body.code).toBe('STATE_NOT_FOUND');

      // 4. Deleted state ID (AC-10)
      const deletedStateRes = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (level, workspace_id, project_id, name, state_group, color, created_at, updated_at, deleted_at)
         VALUES ('project', $1, $2, 'Already Deleted', 'active', '#2F9E6E', now(), now(), now())
         RETURNING id`,
        [workspaceId, projectId],
      );
      const deletedId = deletedStateRes[0].id;

      const delRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${deletedId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(delRes.body.code).toBe('STATE_NOT_FOUND');

      // 5. Random UUID (AC-10)
      const randRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/00000000-0000-0000-0000-000000000000`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(randRes.body.code).toBe('STATE_NOT_FOUND');

      // 6. Non-UUID format (API B2, B4)
      const nonUuidRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/not-a-uuid`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(404);
      expect(nonUuidRes.body.code).toBe('STATE_NOT_FOUND');

      // All 404 responses have identical body code and message
      expect(defRes.body.code).toBe(wsRes.body.code);
      expect(defRes.body.message).toBe(wsRes.body.message);
      expect(defRes.body.message).toBe(nonUuidRes.body.message);
    });

    it('AC-24: requires replacement when live work items exist; moves live work items and preserves updated_at / updated_by_id', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      // Create target state "Review"
      const createRes = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Review',
          group: 'active',
          color: '#7A5CC7',
        })
        .expect(201);
      const reviewStateId = (createRes.body as StateMutationResponse).state.id;

      // Seed 3 work items at "Review" with past updated_at
      const pastTime = new Date('2026-01-01T10:00:00.000Z');
      const workItemIds: string[] = [];
      for (let i = 1; i <= 3; i++) {
        const rows = await e2e.dataSource.query<{ id: string }[]>(
          `INSERT INTO work_items (id, workspace_id, project_id, number, title, description, state_id, idempotency_key, created_by_id, updated_by_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, '', $5, gen_random_uuid(), $6, NULL, $7, $7)
           RETURNING id`,
          [
            workspaceId,
            projectId,
            i,
            `Work Item ${i}`,
            reviewStateId,
            wsAdmin.id,
            pastTime,
          ],
        );
        workItemIds.push(rows[0].id);
      }

      // Attempt DELETE without replacement fails with 409 STATE_REPLACEMENT_REQUIRED
      const reqRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${reviewStateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(reqRes.body.code).toBe('STATE_REPLACEMENT_REQUIRED');

      // Fetch a valid replacement state: default Todo state
      const [todoState] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // DELETE with valid replacementStateId succeeds with 204
      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${reviewStateId}?replacementStateId=${todoState.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Verify work items have been moved to todoState.id
      const updatedItems = await e2e.dataSource.query<
        {
          id: string;
          state_id: string;
          updated_at: Date;
          updated_by_id: string | null;
        }[]
      >(
        `SELECT id, state_id, updated_at, updated_by_id FROM work_items WHERE id = ANY($1)`,
        [workItemIds],
      );

      expect(updatedItems).toHaveLength(3);
      for (const item of updatedItems) {
        expect(item.state_id).toBe(todoState.id);
        // RQ D20: updated_at and updated_by_id MUST NOT be modified
        expect(new Date(item.updated_at).getTime()).toBe(pastTime.getTime());
        expect(item.updated_by_id).toBeNull();
      }
    });

    it('AC-26: does not move work items of soft-deleted projects or soft-deleted work items', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      // Create target state "Testing"
      const createRes = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Testing',
          group: 'active',
          color: '#3E7BD6',
        })
        .expect(201);
      const testingStateId = (createRes.body as StateMutationResponse).state.id;

      // 1. Live work item in active project
      const liveItem = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_items (id, workspace_id, project_id, number, title, description, state_id, idempotency_key, created_by_id, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 1, 'Live Item', '', $3, gen_random_uuid(), $4, now(), now())
         RETURNING id`,
        [workspaceId, projectId, testingStateId, wsAdmin.id],
      );

      // 2. Soft-deleted work item in active project
      const deletedItem = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_items (id, workspace_id, project_id, number, title, description, state_id, idempotency_key, created_by_id, created_at, updated_at, deleted_at)
         VALUES (gen_random_uuid(), $1, $2, 2, 'Deleted Item', '', $3, gen_random_uuid(), $4, now(), now(), now())
         RETURNING id`,
        [workspaceId, projectId, testingStateId, wsAdmin.id],
      );

      // Fetch default In Progress state as replacement
      const [inProgressState] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'in_progress'`,
      );

      // DELETE with replacement
      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${testingStateId}?replacementStateId=${inProgressState.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(204);

      // Live item moved
      const [liveRow] = await e2e.dataSource.query<{ state_id: string }[]>(
        `SELECT state_id FROM work_items WHERE id = $1`,
        [liveItem[0].id],
      );
      expect(liveRow.state_id).toBe(inProgressState.id);

      // Soft-deleted item kept old state (testingStateId)
      const [delRow] = await e2e.dataSource.query<{ state_id: string }[]>(
        `SELECT state_id FROM work_items WHERE id = $1`,
        [deletedItem[0].id],
      );
      expect(delRow.state_id).toBe(testingStateId);
    });

    it('AC-27: rejects invalid replacementStateId with 409 STATE_REPLACEMENT_INVALID or 400 VALIDATION_ERROR', async () => {
      const {
        workspaceId,
        workspaceSlug,
        projectId,
        projectIdentifier,
        wsAdmin,
      } = await seedWorkspaceAndProject();

      const createRes = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Target State',
          group: 'active',
          color: '#2F9E6E',
        })
        .expect(201);
      const targetStateId = (createRes.body as StateMutationResponse).state.id;

      // 1. replacementStateId = target itself -> 409 STATE_REPLACEMENT_INVALID
      const selfRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?replacementStateId=${targetStateId}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(selfRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // 2. replacementStateId = soft deleted state -> 409 STATE_REPLACEMENT_INVALID
      const delState = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (level, workspace_id, project_id, name, state_group, color, created_at, updated_at, deleted_at)
         VALUES ('project', $1, $2, 'Already Gone', 'active', '#2F9E6E', now(), now(), now())
         RETURNING id`,
        [workspaceId, projectId],
      );
      const delRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?replacementStateId=${delState[0].id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(delRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // 3. replacementStateId = state from another workspace -> 409 STATE_REPLACEMENT_INVALID
      const otherWsRes = await http()
        .post('/api/workspaces')
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Other WS',
          slug: `other-ws-${userSeq}`,
          organizationSize: '2-10',
        })
        .expect(201);
      const otherWsState = await e2e.dataSource.query<{ id: string }[]>(
        `INSERT INTO work_item_states (level, workspace_id, name, state_group, color, created_at, updated_at)
         VALUES ('workspace', $1, 'Other WS State', 'active', '#2F9E6E', now(), now())
         RETURNING id`,
        [otherWsRes.body.id],
      );

      const foreignRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?replacementStateId=${otherWsState[0].id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(409);
      expect(foreignRes.body.code).toBe('STATE_REPLACEMENT_INVALID');

      // 4. replacementStateId not a UUID -> 400 VALIDATION_ERROR with replacementInvalidFormat
      const nonUuidRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?replacementStateId=invalid-uuid`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(400);
      expect(nonUuidRes.body.code).toBe('VALIDATION_ERROR');
      expect(nonUuidRes.body.fields.replacementStateId).toBe(
        'Choose a state to move work items to',
      );

      // 5. Unknown query parameter ?force=1 -> 400 VALIDATION_ERROR (forbidNonWhitelisted)
      const forceRes = await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?force=1`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .expect(400);
      expect(forceRes.body.code).toBe('VALIDATION_ERROR');

      // 6. JSON body sent on DELETE -> ignored per API B4 row 140
      const [todoState] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );
      await http()
        .delete(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${targetStateId}?replacementStateId=${todoState.id}`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ unexpected: 'body' })
        .expect(204);
    });

    it('AC-16: concurrent cross-deletes serialize and second delete fails with 409 STATE_REPLACEMENT_INVALID', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // Create state A
      const resA = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State A', group: 'active', color: '#2F9E6E' })
        .expect(201);
      const stateAId = (resA.body as StateMutationResponse).state.id;

      // Create state B
      const resB = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'State B', group: 'active', color: '#3E7BD6' })
        .expect(201);
      const stateBId = (resB.body as StateMutationResponse).state.id;

      // Launch delete A replacing with B, and delete B replacing with A concurrently
      const [deleteA, deleteB] = await Promise.all([
        http()
          .delete(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateAId}?replacementStateId=${stateBId}`,
          )
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN),
        http()
          .delete(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${stateBId}?replacementStateId=${stateAId}`,
          )
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN),
      ]);

      const statuses = [deleteA.status, deleteB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([204, 409]);

      const failedRes = deleteA.status === 409 ? deleteA : deleteB;
      expect(failedRes.body.code).toBe('STATE_REPLACEMENT_INVALID');
    });

    it('AC-32: concurrent create work item and delete state guarantees no live work item points to deleted state', async () => {
      const { workspaceSlug, projectIdentifier, wsAdmin } =
        await seedWorkspaceAndProject();

      // Create state "In Review"
      const res = await http()
        .post(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states`,
        )
        .set('Cookie', wsAdmin.cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'In Review', group: 'active', color: '#7A5CC7' })
        .expect(201);
      const reviewId = (res.body as StateMutationResponse).state.id;

      const [defaultTodo] = await e2e.dataSource.query<{ id: string }[]>(
        `SELECT id FROM work_item_states WHERE default_key = 'todo'`,
      );

      // Concurrently create work item at "In Review" and delete "In Review" replacing with Todo
      const [createItemRes, deleteStateRes] = await Promise.all([
        http()
          .post(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/work-items`,
          )
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN)
          .send({
            title: 'Concurrent Work Item',
            idempotencyKey: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
            stateId: reviewId,
          }),
        http()
          .delete(
            `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/states/${reviewId}?replacementStateId=${defaultTodo.id}`,
          )
          .set('Cookie', wsAdmin.cookie)
          .set('Origin', ORIGIN),
      ]);

      // Delete must succeed with 204
      expect(deleteStateRes.status).toBe(204);

      // Create either failed with 409 STATE_UNAVAILABLE (if delete locked reviewId first),
      // or succeeded with 201 (if create locked reviewId first, in which case delete moved it to defaultTodo.id)
      expect([201, 409]).toContain(createItemRes.status);
      if (createItemRes.status === 409) {
        expect(createItemRes.body.code).toBe('STATE_UNAVAILABLE');
      }

      // In DB: absolutely zero live work items pointing to reviewId
      const liveItemsAtReview = await e2e.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(*) as count FROM work_items WHERE state_id = $1 AND deleted_at IS NULL`,
        [reviewId],
      );
      expect(Number(liveItemsAtReview[0].count)).toBe(0);
    });
  });
});
