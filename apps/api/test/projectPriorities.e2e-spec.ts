import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  type PriorityListResponse,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN as ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';

describe('Project Priorities API (e2e)', () => {
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
    const email = `priority-user-${userSeq}@openplany.dev`;
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
        name: 'Priorities Workspace',
        slug: `priorities-ws-${userSeq}`,
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
        name: 'Priorities Project',
        identifier: 'PRP',
        description: 'Priorities Project Description',
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

  async function addMember(
    workspaceId: string,
    projectId: string,
    user: { id: string },
    role: 'admin' | 'contributor' | 'commenter' | 'viewer',
  ) {
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [workspaceId, user.id],
    );
    await e2e.dataSource.query(
      `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, $3, $4, 'project', true, now(), now(), now())`,
      [projectId, workspaceId, user.id, role],
    );
  }

  it('AC-04, INV-08: GET priorities returns 5 default priorities in order, initialPriorityId, exact response fields for project roles and workspace admin', async () => {
    const {
      workspaceId,
      workspaceSlug,
      projectId,
      projectIdentifier,
      wsAdmin,
    } = await seedWorkspaceAndProject();

    const roles = ['admin', 'contributor', 'commenter', 'viewer'] as const;

    for (const role of roles) {
      const user = await newUser();
      await addMember(workspaceId, projectId, user, role);

      const res = await http()
        .get(
          `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities`,
        )
        .set('Cookie', user.cookie)
        .expect(200);

      expect(res.headers['cache-control']).toBe('no-store');

      const body = res.body as PriorityListResponse;
      expect(body.priorities).toHaveLength(5);

      // Verify order: Urgent -> High -> Medium -> Low -> None
      expect(body.priorities.map((p) => p.band)).toEqual([
        'urgent',
        'high',
        'medium',
        'low',
        'none',
      ]);
      expect(body.priorities.map((p) => p.name)).toEqual([
        'Urgent',
        'High',
        'Medium',
        'Low',
        'None',
      ]);

      const nonePriority = body.priorities.find((p) => p.band === 'none')!;
      expect(body.initialPriorityId).toBe(nonePriority.id);

      // INV-08: Verify each item has only allowed fields
      for (const item of body.priorities) {
        expect(Object.keys(item).sort()).toEqual([
          'band',
          'color',
          'defaultKey',
          'id',
          'level',
          'name',
        ]);
        expect(item.level).toBe('default');
        expect(item.defaultKey).toBe(item.band);
      }
    }

    // Workspace Admin can also view priorities
    const adminRes = await http()
      .get(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities`,
      )
      .set('Cookie', wsAdmin.cookie)
      .expect(200);
    expect(adminRes.body.priorities).toHaveLength(5);
  });

  it('AC-05: returns 403 FORBIDDEN when user lacks project.workitems.view permission', async () => {
    const { workspaceId, workspaceSlug, projectId, projectIdentifier } =
      await seedWorkspaceAndProject();

    // Revoke project.workitems.view from contributor role in database
    await e2e.dataSource.query(
      `DELETE FROM role_permissions WHERE scope = 'project' AND role_key = 'contributor' AND permission_key = 'project.workitems.view'`,
    );

    const contributor = await newUser();
    await addMember(workspaceId, projectId, contributor, 'contributor');

    const res = await http()
      .get(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities`,
      )
      .set('Cookie', contributor.cookie);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('returns 404 when project does not exist', async () => {
    const { workspaceSlug, wsAdmin } = await seedWorkspaceAndProject();

    const res = await http()
      .get(`/api/workspaces/${workspaceSlug}/projects/NONEXISTENT/priorities`)
      .set('Cookie', wsAdmin.cookie);

    expect(res.status).toBe(404);
  });

  it('AC-16, INV-07: GET priorities returns 3-level priorities in correct order (band -> level -> createdAt -> id), excluding deleted, other project, other workspace; ignores query string', async () => {
    const {
      workspaceId,
      workspaceSlug,
      projectId,
      projectIdentifier,
      wsAdmin,
    } = await seedWorkspaceAndProject();

    // Create project Q in same workspace W
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

    // Create another workspace W2
    const ws2Res = await http()
      .post('/api/workspaces')
      .set('Cookie', wsAdmin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Other Workspace',
        slug: `other-ws-${userSeq}`,
        organizationSize: '2-10',
      })
      .expect(201);
    const workspace2Id = ws2Res.body.id as string;

    // Seed priorities directly in database (bypassing app as intended, AC-16)
    // 1. Workspace W live priority "Blocker" (band: urgent)
    const [blocker] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES ('workspace', $1, 'Blocker', 'urgent', '#B05A5A', now(), now()) RETURNING id`,
      [workspaceId],
    );

    // 2. Workspace W soft-deleted priority "Old Blocker" (band: urgent)
    await e2e.dataSource.query(
      `INSERT INTO work_item_priorities (level, workspace_id, name, priority_band, color, created_at, updated_at, deleted_at)
       VALUES ('workspace', $1, 'Old Blocker', 'urgent', '#B05A5A', now(), now(), now())`,
      [workspaceId],
    );

    // 3. Project P live priority "Nice to have" (band: low)
    const [niceToHave] = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES ('project', $1, $2, 'Nice to have', 'low', '#3E7BD6', now(), now()) RETURNING id`,
      [workspaceId, projectId],
    );

    // 4. Project Q live priority "Q-only" (band: medium)
    await e2e.dataSource.query(
      `INSERT INTO work_item_priorities (level, workspace_id, project_id, name, priority_band, color, created_at, updated_at)
       VALUES ('project', $1, $2, 'Q-only', 'medium', '#E08A1E', now(), now())`,
      [workspaceId, projectQId],
    );

    // 5. Workspace W2 live priority "Other" (band: high)
    await e2e.dataSource.query(
      `INSERT INTO work_item_priorities (level, workspace_id, name, priority_band, color, created_at, updated_at)
       VALUES ('workspace', $1, 'Other', 'high', '#D0642B', now(), now())`,
      [workspace2Id],
    );

    // GET priorities with strange query string (?level=project, API B4)
    const res = await http()
      .get(
        `/api/workspaces/${workspaceSlug}/projects/${projectIdentifier}/priorities?level=project`,
      )
      .set('Cookie', wsAdmin.cookie)
      .expect(200);

    const body = res.body as PriorityListResponse;

    // Expected order (AC-16):
    // 1. Urgent (default, urgent)
    // 2. Blocker (workspace, urgent)
    // 3. High (default, high)
    // 4. Medium (default, medium)
    // 5. Low (default, low)
    // 6. Nice to have (project, low)
    // 7. None (default, none)
    expect(body.priorities).toHaveLength(7);
    expect(body.priorities.map((p) => p.name)).toEqual([
      'Urgent',
      'Blocker',
      'High',
      'Medium',
      'Low',
      'Nice to have',
      'None',
    ]);

    expect(body.priorities.map((p) => p.band)).toEqual([
      'urgent',
      'urgent',
      'high',
      'medium',
      'low',
      'low',
      'none',
    ]);

    expect(body.priorities.map((p) => p.level)).toEqual([
      'default',
      'workspace',
      'default',
      'default',
      'default',
      'project',
      'default',
    ]);

    // Verify Blocker & Nice to have attributes
    const blockerPrio = body.priorities.find((p) => p.name === 'Blocker')!;
    expect(blockerPrio.id).toBe(blocker!.id);
    expect(blockerPrio.defaultKey).toBeNull();

    const nicePrio = body.priorities.find((p) => p.name === 'Nice to have')!;
    expect(nicePrio.id).toBe(niceToHave!.id);
    expect(nicePrio.defaultKey).toBeNull();

    // Verify excluded items are not in response
    const allNames = body.priorities.map((p) => p.name);
    expect(allNames).not.toContain('Old Blocker');
    expect(allNames).not.toContain('Q-only');
    expect(allNames).not.toContain('Other');
  });
});
