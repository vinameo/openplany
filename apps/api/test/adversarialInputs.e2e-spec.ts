import request from 'supertest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
} from '@repo/contracts';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  adversarialBodies,
  expectNoServerErrors,
} from './helpers/adversarialInputs.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN as ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';

/**
 * Every JSON write endpoint answers malformed bodies with 4xx, never 500
 * (CLAUDE.md §8 design pass). A new write endpoint gets a case here.
 */

/** Below every per-user write limit, so each case reaches validation. */
const REQUESTS_PER_USER = 20;

describe('Adversarial inputs (e2e)', () => {
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
    const email = `adversary-${userSeq}@openplany.dev`;
    const id = await createUser(e2e, email, {
      is_superuser: opts.instanceAdmin ?? false,
    });
    return { id, email, cookie: await signInCookie(e2e, email) };
  }

  async function seedWorkspace() {
    const owner = await newUser({ instanceAdmin: true });
    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', owner.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Adversarial',
        slug: 'adversarial',
        organizationSize: '2-10',
      })
      .expect(201);
    return { slug: res.body.slug as string, id: res.body.id as string, owner };
  }

  async function newWorkspaceAdmin(workspaceId: string) {
    const user = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'admin', true, now(), now(), now())`,
      [workspaceId, user.id],
    );
    return user;
  }

  /** A cookie that changes every REQUESTS_PER_USER requests. */
  function rotatingCookie(makeUser: () => Promise<{ cookie: string }>) {
    let cookie = '';
    return async (index: number) => {
      if (index % REQUESTS_PER_USER === 0) cookie = (await makeUser()).cookie;
      return cookie;
    };
  }

  it('POST /workspaces/:slug/projects', async () => {
    const ws = await seedWorkspace();
    const cookieFor = rotatingCookie(() => newWorkspaceAdmin(ws.id));
    const valid = {
      name: 'Web',
      identifier: 'WEB',
      description: 'Website',
      icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
      coverKey: DEFAULT_PROJECT_COVER,
    };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .post(`/api/workspaces/${ws.slug}/projects`)
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('PATCH /workspaces/:slug/projects/:identifier', async () => {
    const ws = await seedWorkspace();
    const admin = await newWorkspaceAdmin(ws.id);
    const created = await http()
      .post(`/api/workspaces/${ws.slug}/projects`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Project Target',
        identifier: 'TGT',
        description: 'Initial',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const identifier = created.body.project.identifier as string;
    const projectId = created.body.project.id as string;

    const cookieFor = rotatingCookie(async () => {
      const u = await newWorkspaceAdmin(ws.id);
      await e2e.dataSource.query(
        `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, 'admin', 'project', true, now(), now())`,
        [projectId, ws.id, u.id],
      );
      return u;
    });

    const valid = {
      name: 'Updated Project',
      description: 'Updated description',
      icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
      coverKey: DEFAULT_PROJECT_COVER,
      timezone: 'UTC',
    };

    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .patch(`/api/workspaces/${ws.slug}/projects/${identifier}`)
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('PATCH /workspaces/:slug', async () => {
    const ws = await seedWorkspace();
    const cookieFor = rotatingCookie(() => newWorkspaceAdmin(ws.id));
    const valid = {
      name: 'Renamed',
      organizationSize: '2-10',
      timezone: 'UTC',
    };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .patch(`/api/workspaces/${ws.slug}`)
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('POST /workspaces/:slug/members', async () => {
    const ws = await seedWorkspace();
    const candidate = await newUser();
    const cookieFor = rotatingCookie(() => newWorkspaceAdmin(ws.id));
    const valid = { members: [{ userId: candidate.id, role: 'member' }] };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .post(`/api/workspaces/${ws.slug}/members`)
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('POST /workspaces', async () => {
    const admin = await newUser({ instanceAdmin: true });
    const valid = { name: 'Acme', slug: 'acme-team', organizationSize: '2-10' };
    await expectNoServerErrors(adversarialBodies(valid), (body) =>
      http()
        .post('/api/workspaces')
        .set('Cookie', admin.cookie)
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('PATCH /users/me', async () => {
    const cookieFor = rotatingCookie(() => newUser());
    const valid = { firstName: 'An', lastName: 'Nguyen', displayName: 'An' };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .patch('/api/users/me')
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('POST /admin/users', async () => {
    const cookieFor = rotatingCookie(() => newUser({ instanceAdmin: true }));
    const valid = {
      firstName: 'Binh',
      lastName: 'Tran',
      displayName: 'Binh',
      email: 'binh@openplany.dev',
      password: 'Secret123!',
    };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .post('/api/admin/users')
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('PATCH /admin/role-permissions', async () => {
    const cookieFor = rotatingCookie(() => newUser({ instanceAdmin: true }));
    const valid = {
      changes: [
        {
          scope: 'workspace',
          key: 'member',
          version: 1,
          permissions: ['workspace.settings.view'],
        },
      ],
    };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .patch('/api/admin/role-permissions')
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('POST /workspaces/:slug/projects/:identifier/members', async () => {
    const ws = await seedWorkspace();
    const admin = await newWorkspaceAdmin(ws.id);
    const created = await http()
      .post(`/api/workspaces/${ws.slug}/projects`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Project Members Target',
        identifier: 'PMT',
        description: 'Initial',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const identifier = created.body.project.identifier as string;
    const projectId = created.body.project.id as string;

    const cookieFor = rotatingCookie(async () => {
      const u = await newWorkspaceAdmin(ws.id);
      await e2e.dataSource.query(
        `INSERT INTO project_members (project_id, workspace_id, member_id, role, role_scope, is_active, created_at, updated_at, joined_at)
         VALUES ($1, $2, $3, 'admin', 'project', true, now(), now(), now())`,
        [projectId, ws.id, u.id],
      );
      return u;
    });

    const targetUser = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [ws.id, targetUser.id],
    );

    const valid = { members: [{ userId: targetUser.id, role: 'contributor' }] };
    await expectNoServerErrors(adversarialBodies(valid), async (body, i) =>
      http()
        .post(`/api/workspaces/${ws.slug}/projects/${identifier}/members`)
        .set('Cookie', await cookieFor(i))
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });

  it('POST /workspaces/:slug/projects/:identifier/members role range and membership constraints (API B5)', async () => {
    const ws = await seedWorkspace();
    const admin = await newWorkspaceAdmin(ws.id);
    const created = await http()
      .post(`/api/workspaces/${ws.slug}/projects`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Role Constraint Target',
        identifier: 'RCT',
        description: 'Test',
        icon: { name: DEFAULT_PROJECT_ICON, color: DEFAULT_PROJECT_ICON_COLOR },
        coverKey: DEFAULT_PROJECT_COVER,
      })
      .expect(201);
    const identifier = created.body.project.identifier as string;

    const memberUser = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'member', true, now(), now(), now())`,
      [ws.id, memberUser.id],
    );

    const guestUser = await newUser();
    await e2e.dataSource.query(
      `INSERT INTO workspace_members (workspace_id, member_id, role, is_active, created_at, updated_at, joined_at)
       VALUES ($1, $2, 'guest', true, now(), now(), now())`,
      [ws.id, guestUser.id],
    );

    const otherWsAdmin = await newWorkspaceAdmin(ws.id);

    // 1. Member + role: 'viewer' -> 409 MEMBERS_NOT_ADDABLE, fields['members.0.role']
    const resMemberViewer = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${identifier}/members`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({ members: [{ userId: memberUser.id, role: 'viewer' }] })
      .expect(409);
    expect(resMemberViewer.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(resMemberViewer.body.fields?.['members.0.role']).toBe(
      PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
    );

    // 2. Guest + role: 'commenter' -> 409 MEMBERS_NOT_ADDABLE, fields['members.0.role']
    const resGuestCommenter = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${identifier}/members`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({ members: [{ userId: guestUser.id, role: 'commenter' }] })
      .expect(409);
    expect(resGuestCommenter.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(resGuestCommenter.body.fields?.['members.0.role']).toBe(
      PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.role_not_allowed,
    );

    // 3. role: 'guest' (old key) -> 400
    await http()
      .post(`/api/workspaces/${ws.slug}/projects/${identifier}/members`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({ members: [{ userId: memberUser.id, role: 'guest' }] })
      .expect(400);

    // 4. userId of Workspace Admin -> 409 MEMBERS_NOT_ADDABLE, fields['members.0.userId'] = workspace_admin
    const resWsAdmin = await http()
      .post(`/api/workspaces/${ws.slug}/projects/${identifier}/members`)
      .set('Cookie', admin.cookie)
      .set('Origin', ORIGIN)
      .send({ members: [{ userId: otherWsAdmin.id, role: 'contributor' }] })
      .expect(409);
    expect(resWsAdmin.body.code).toBe('MEMBERS_NOT_ADDABLE');
    expect(resWsAdmin.body.fields?.['members.0.userId']).toBe(
      PROJECT_MEMBER_NOT_ADDABLE_MESSAGES.workspace_admin,
    );
  });

  it('POST /auth/sign-in', async () => {
    const user = await newUser();
    const valid = { email: user.email, password: 'Secret123!' };
    await expectNoServerErrors(adversarialBodies(valid), (body) =>
      http()
        .post('/api/auth/sign-in')
        .set('Origin', ORIGIN)
        .send(body as object),
    );
  });
});

