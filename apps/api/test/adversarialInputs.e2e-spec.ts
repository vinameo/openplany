import request from 'supertest';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
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
