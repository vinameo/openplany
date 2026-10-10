import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser as createE2eUser,
  signInCookie as signInE2eCookie,
  DEFAULT_E2E_ORIGIN,
  DEFAULT_E2E_PASSWORD,
} from './helpers/e2eUsers.js';

const ORIGIN = DEFAULT_E2E_ORIGIN;
const PASSWORD = DEFAULT_E2E_PASSWORD;

describe('Workspaces (e2e)', () => {
  let e2e: E2eApp;

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

  async function createUser(
    email: string,
    timezone = 'Asia/Ho_Chi_Minh',
    flags: Record<string, boolean> = {},
  ): Promise<string> {
    return createE2eUser(e2e, email, {
      first: 'An',
      last: 'Nguyen',
      display: 'An Nguyen',
      timezone,
      is_superuser: true,
      ...flags,
    });
  }

  const signInCookie = (email: string) =>
    signInE2eCookie(e2e, email, PASSWORD, ORIGIN);

  it('1. returns 401 UNAUTHENTICATED on all endpoints without session cookie', async () => {
    await http().get('/api/workspaces/slug-check?slug=acme').expect(401);
    await http().post('/api/workspaces').set('Origin', ORIGIN).send({
      name: 'Acme',
      slug: 'acme',
      organizationSize: 'Just myself',
    }).expect(401);
    await http().get('/api/workspaces').expect(401);
    await http().get('/api/workspaces/acme').expect(401);
  });

  it('2. returns 403 PASSWORD_RESET_REQUIRED when session is reset-only', async () => {
    await createUser('reset@openplany.dev', 'UTC', { is_password_reset_required: true });
    const cookie = await signInCookie('reset@openplany.dev');

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Acme Corp',
        slug: 'acme-corp',
        organizationSize: '2-10',
      })
      .expect(403);

    expect(res.body.code).toBe('PASSWORD_RESET_REQUIRED');
  });

  it('3. valid POST creates workspace, admin member, updates last_workspace_id and copies timezone', async () => {
    const userId = await createUser('user1@openplany.dev', 'Asia/Ho_Chi_Minh');
    const cookie = await signInCookie('user1@openplany.dev');

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Acme Corporation',
        slug: 'acme-corp',
        organizationSize: '11-50',
      })
      .expect(201);

    expect(res.headers.location).toBe('/api/workspaces/acme-corp');
    expect(res.body).toMatchObject({
      name: 'Acme Corporation',
      slug: 'acme-corp',
      organizationSize: '11-50',
      timezone: 'Asia/Ho_Chi_Minh',
      role: 'admin',
      memberCount: 1,
    });
    expect(res.body.id).toBeDefined();

    // Verify DB state
    const workspaces = await e2e.dataSource.query<{ id: string; created_by_id: string; timezone: string }[]>(
      'SELECT id, created_by_id, timezone FROM workspaces WHERE slug = $1',
      ['acme-corp'],
    );
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.created_by_id).toBe(userId);
    expect(workspaces[0]!.timezone).toBe('Asia/Ho_Chi_Minh');

    const members = await e2e.dataSource.query<{ role: string; member_id: string }[]>(
      'SELECT role, member_id FROM workspace_members WHERE workspace_id = $1',
      [workspaces[0]!.id],
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('admin');
    expect(members[0]!.member_id).toBe(userId);

    const userRow = await e2e.dataSource.query<{ last_workspace_id: string }[]>(
      'SELECT last_workspace_id FROM users WHERE id = $1',
      [userId],
    );
    expect(userRow[0]!.last_workspace_id).toBe(workspaces[0]!.id);
  });

  it('4. POST rejects invalid and reserved slugs with 400 and fields.slug', async () => {
    await createUser('user2@openplany.dev');
    const cookie = await signInCookie('user2@openplany.dev');

    const testSlugs = [
      'admin',
      'slug-check',
      'Acme',
      'ab',
      'a--b',
      'create-user',
      'roles-and-permissions',
    ];
    for (const slug of testSlugs) {
      const res = await http()
        .post('/api/workspaces')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Acme',
          slug,
          organizationSize: 'Just myself',
        })
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields?.slug).toBeDefined();
    }
  });

  it('4b. slug-check returns RESERVED for reserved system route slugs create-user and roles-and-permissions (AC-23)', async () => {
    await createUser('slugchecker@openplany.dev');
    const cookie = await signInCookie('slugchecker@openplany.dev');

    for (const slug of ['create-user', 'roles-and-permissions']) {
      const res = await http()
        .get(`/api/workspaces/slug-check?slug=${slug}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual({
        slug,
        available: false,
        reason: 'RESERVED',
      });
    }
  });

  it('5. race condition: 2 parallel POST with same slug -> one 201, one 409', async () => {
    await createUser('userA@openplany.dev');
    await createUser('userB@openplany.dev');
    const cookieA = await signInCookie('userA@openplany.dev');
    const cookieB = await signInCookie('userB@openplany.dev');

    const req1 = http()
      .post('/api/workspaces')
      .set('Cookie', cookieA)
      .set('Origin', ORIGIN)
      .send({
        name: 'Team Unicorn',
        slug: 'team-unicorn',
        organizationSize: '2-10',
      });

    const req2 = http()
      .post('/api/workspaces')
      .set('Cookie', cookieB)
      .set('Origin', ORIGIN)
      .send({
        name: 'Team Unicorn',
        slug: 'team-unicorn',
        organizationSize: '2-10',
      });

    const [res1, res2] = await Promise.all([req1, req2]);
    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const conflictRes = res1.status === 409 ? res1 : res2;
    expect(conflictRes.body.code).toBe('SLUG_ALREADY_EXISTS');
    expect(conflictRes.body.fields?.slug).toBe('This URL is already taken. Choose another one.');

    // Exactly 1 workspace and 1 member created
    const count = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM workspaces WHERE slug = $1',
      ['team-unicorn'],
    );
    expect(Number(count[0]!.count)).toBe(1);
  });

  it('6. rejects extra forbidden fields (mass assignment prevention)', async () => {
    await createUser('user3@openplany.dev');
    const cookie = await signInCookie('user3@openplany.dev');

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Hacked',
        slug: 'hacked-corp',
        organizationSize: 'Just myself',
        ownerId: '00000000-0000-0000-0000-000000000000',
        role: 'admin',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields?.ownerId).toBeDefined();

    const count = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM workspaces WHERE slug = $1',
      ['hacked-corp'],
    );
    expect(Number(count[0]!.count)).toBe(0);
  });

  it('7. rate limits POST to 5 creations per hour, 6th receives 429 with Retry-After header', async () => {
    await createUser('spammer@openplany.dev');
    const cookie = await signInCookie('spammer@openplany.dev');

    for (let i = 1; i <= 5; i++) {
      await http()
        .post('/api/workspaces')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: `Org ${i}`,
          slug: `org-${i}`,
          organizationSize: 'Just myself',
        })
        .expect(201);
    }

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Org 6',
        slug: 'org-6',
        organizationSize: 'Just myself',
      })
      .expect(429);

    expect(res.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('8. rejects POST with untrusted Origin header with 403 ORIGIN_NOT_ALLOWED', async () => {
    await createUser('user4@openplany.dev');
    const cookie = await signInCookie('user4@openplany.dev');

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', 'https://malicious-site.com')
      .send({
        name: 'Evil Corp',
        slug: 'evil-corp',
        organizationSize: 'Just myself',
      })
      .expect(403);

    expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('8b. rejects POST and slug-check from user with is_superuser = false with 403 FORBIDDEN', async () => {
    await createUser('regular@openplany.dev', 'UTC', { is_superuser: false });
    const cookie = await signInCookie('regular@openplany.dev');

    const res = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({
        name: 'Forbidden Corp',
        slug: 'forbidden-corp',
        organizationSize: 'Just myself',
      })
      .expect(403);

    expect(res.body.code).toBe('FORBIDDEN');

    const slugRes = await http()
      .get('/api/workspaces/slug-check?slug=forbidden-corp')
      .set('Cookie', cookie)
      .expect(403);

    expect(slugRes.body.code).toBe('FORBIDDEN');
  });

  it('9. GET /api/workspaces returns only active workspaces for current user', async () => {
    await createUser('multi@openplany.dev');
    const cookie = await signInCookie('multi@openplany.dev');

    await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'Active Org', slug: 'active-org', organizationSize: '2-10' })
      .expect(201);

    const createRes2 = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'Soft Deleted', slug: 'soft-deleted', organizationSize: '2-10' })
      .expect(201);

    // Soft delete the second workspace
    await e2e.dataSource.query('UPDATE workspaces SET deleted_at = now() WHERE id = $1', [
      createRes2.body.id,
    ]);

    const listRes = await http()
      .get('/api/workspaces')
      .set('Cookie', cookie)
      .expect(200);

    expect(listRes.body.workspaces).toHaveLength(1);
    expect(listRes.body.workspaces[0]!.slug).toBe('active-org');
    // Last workspace was soft-deleted, so lastWorkspaceSlug is null
    expect(listRes.body.lastWorkspaceSlug).toBeNull();
  });

  it('10. GET /:slug returns 404 when user is not a member of another user workspace', async () => {
    await createUser('ownerA@openplany.dev');
    await createUser('otherB@openplany.dev');
    const cookieA = await signInCookie('ownerA@openplany.dev');
    const cookieB = await signInCookie('otherB@openplany.dev');

    await http()
      .post('/api/workspaces')
      .set('Cookie', cookieA)
      .set('Origin', ORIGIN)
      .send({ name: 'Secret A', slug: 'secret-a', organizationSize: 'Just myself' })
      .expect(201);

    const resB = await http()
      .get('/api/workspaces/secret-a')
      .set('Cookie', cookieB)
      .expect(404);

    expect(resB.body.code).toBe('NOT_FOUND');
    expect(resB.body.message).toBe('Workspace not found');

    // Identical error to non-existent slug
    const resNotFound = await http()
      .get('/api/workspaces/non-existent-slug')
      .set('Cookie', cookieB)
      .expect(404);

    expect(resNotFound.body.statusCode).toBe(resB.body.statusCode);
    expect(resNotFound.body.code).toBe(resB.body.code);
    expect(resNotFound.body.message).toBe(resB.body.message);
  });

  it('11. GET /:slug succeeds and updates last_workspace_id', async () => {
    const userId = await createUser('member@openplany.dev');
    const cookie = await signInCookie('member@openplany.dev');

    const createRes = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'OpenPlany Org', slug: 'openplany-org', organizationSize: '2-10' })
      .expect(201);

    // Reset last_workspace_id to null
    await e2e.dataSource.query('UPDATE users SET last_workspace_id = NULL WHERE id = $1', [
      userId,
    ]);

    const getRes = await http()
      .get('/api/workspaces/openplany-org')
      .set('Cookie', cookie)
      .expect(200);

    expect(getRes.body.slug).toBe('openplany-org');
    expect(getRes.body.role).toBe('admin');

    // Wait short tick for asynchronous update
    await new Promise((resolve) => setTimeout(resolve, 50));

    const user = await e2e.dataSource.query<{ last_workspace_id: string }[]>(
      'SELECT last_workspace_id FROM users WHERE id = $1',
      [userId],
    );
    expect(user[0]!.last_workspace_id).toBe(createRes.body.id);
  });

  it('12. slug-check returns TAKEN even for soft-deleted workspace', async () => {
    await createUser('checker@openplany.dev');
    const cookie = await signInCookie('checker@openplany.dev');

    const createRes = await http()
      .post('/api/workspaces')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .send({ name: 'Old Company', slug: 'old-company', organizationSize: 'Just myself' })
      .expect(201);

    await e2e.dataSource.query('UPDATE workspaces SET deleted_at = now() WHERE id = $1', [
      createRes.body.id,
    ]);

    const res = await http()
      .get('/api/workspaces/slug-check?slug=old-company')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toEqual({
      slug: 'old-company',
      available: false,
      reason: 'TAKEN',
    });
  });

  it('13. every response includes Cache-Control: no-store and X-Request-Id', async () => {
    await createUser('headeruser@openplany.dev');
    const cookie = await signInCookie('headeruser@openplany.dev');

    const res = await http()
      .get('/api/workspaces')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  describe('PATCH /api/workspaces/:slug', () => {
    async function seedWorkspace(ownerEmail: string, slug = 'test-ws') {
      const ownerId = await createUser(ownerEmail, 'UTC');
      const cookie = await signInCookie(ownerEmail);
      const res = await http()
        .post('/api/workspaces')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({
          name: 'Original Name',
          slug,
          organizationSize: '2-10',
        })
        .expect(201);
      return { ownerId, cookie, workspace: res.body };
    }

    it('1. owner updates name -> 200, has permissions, updatedAt, DB updated, slug preserved', async () => {
      const { ownerId, cookie } = await seedWorkspace('owner1@openplany.dev', 'openstudy');

      const res = await http()
        .patch('/api/workspaces/openstudy')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'OpenStudy Team' })
        .expect(200);

      expect(res.body.name).toBe('OpenStudy Team');
      expect(res.body.slug).toBe('openstudy');
      expect(res.body.permissions).toEqual([
        'workspace.settings.update',
        'workspace.members.view',
        'workspace.members.email.view',
      ]);
      expect(res.body.updatedAt).toBeDefined();

      const rows = await e2e.dataSource.query<{ name: string; slug: string; updated_by_id: string }[]>(
        'SELECT name, slug, updated_by_id FROM workspaces WHERE slug = $1',
        ['openstudy'],
      );
      expect(rows[0]!.name).toBe('OpenStudy Team');
      expect(rows[0]!.slug).toBe('openstudy');
      expect(rows[0]!.updated_by_id).toBe(ownerId);
    });

    it('2. empty name, 81 chars, https://... -> 400 fields.name', async () => {
      const { cookie } = await seedWorkspace('owner2@openplany.dev', 'ws-validation');

      // Empty name
      const resEmpty = await http()
        .patch('/api/workspaces/ws-validation')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: '   ' })
        .expect(400);
      expect(resEmpty.body.code).toBe('VALIDATION_ERROR');
      expect(resEmpty.body.fields).toHaveProperty('name');

      // 81 chars
      const resLong = await http()
        .patch('/api/workspaces/ws-validation')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'a'.repeat(81) })
        .expect(400);
      expect(resLong.body.fields).toHaveProperty('name');

      // URL
      const resUrl = await http()
        .patch('/api/workspaces/ws-validation')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'https://evil.example' })
        .expect(400);
      expect(resUrl.body.fields).toHaveProperty('name');
    });

    it('3. body with forbidden fields (slug, ownerId) -> 400, DB unchanged', async () => {
      const { cookie } = await seedWorkspace('owner3@openplany.dev', 'ws-forbidden-fields');

      await http()
        .patch('/api/workspaces/ws-forbidden-fields')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ slug: 'new-slug' })
        .expect(400);

      await http()
        .patch('/api/workspaces/ws-forbidden-fields')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ ownerId: '00000000-0000-0000-0000-000000000000' })
        .expect(400);

      const rows = await e2e.dataSource.query<{ slug: string }[]>(
        'SELECT slug FROM workspaces WHERE slug = $1',
        ['ws-forbidden-fields'],
      );
      expect(rows).toHaveLength(1);
    });

    it('4. timezone valid / Mars/Base -> 200 / 400, users.user_timezone unchanged', async () => {
      const { ownerId, cookie } = await seedWorkspace('owner4@openplany.dev', 'ws-tz');

      const resValid = await http()
        .patch('/api/workspaces/ws-tz')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ timezone: 'Asia/Ho_Chi_Minh' })
        .expect(200);
      expect(resValid.body.timezone).toBe('Asia/Ho_Chi_Minh');

      const userRow = await e2e.dataSource.query<{ user_timezone: string }[]>(
        'SELECT user_timezone FROM users WHERE id = $1',
        [ownerId],
      );
      expect(userRow[0]!.user_timezone).toBe('UTC'); // personal tz unchanged

      const resInvalid = await http()
        .patch('/api/workspaces/ws-tz')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ timezone: 'Mars/Base' })
        .expect(400);
      expect(resInvalid.body.fields).toHaveProperty('timezone');
    });

    it('5. workspace with seed Asia/Saigon, only update name -> 200, timezone preserved', async () => {
      const { cookie, workspace } = await seedWorkspace('owner5@openplany.dev', 'ws-saigon');
      await e2e.dataSource.query(
        'UPDATE workspaces SET timezone = $1 WHERE id = $2',
        ['Asia/Saigon', workspace.id],
      );

      const res = await http()
        .patch('/api/workspaces/ws-saigon')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Saigon Team' })
        .expect(200);

      expect(res.body.name).toBe('Saigon Team');
      expect(res.body.timezone).toBe('Asia/Saigon');
    });

    it('6. body {} -> 400; duplicate values -> 200 without DB row version update', async () => {
      const { cookie, workspace } = await seedWorkspace('owner6@openplany.dev', 'ws-duplicate');

      // Empty body {} -> 400
      const resEmpty = await http()
        .patch('/api/workspaces/ws-duplicate')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({})
        .expect(400);
      expect(resEmpty.body.code).toBe('VALIDATION_ERROR');

      // Snapshot xmin and updated_at
      const before = await e2e.dataSource.query<{ xmin: string; updated_at: Date }[]>(
        'SELECT xmin::text, updated_at FROM workspaces WHERE id = $1',
        [workspace.id],
      );

      // Send identical values
      const resDup = await http()
        .patch('/api/workspaces/ws-duplicate')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Original Name', organizationSize: '2-10' })
        .expect(200);

      expect(resDup.body.name).toBe('Original Name');

      const after = await e2e.dataSource.query<{ xmin: string; updated_at: Date }[]>(
        'SELECT xmin::text, updated_at FROM workspaces WHERE id = $1',
        [workspace.id],
      );
      expect(after[0]!.xmin).toBe(before[0]!.xmin);
      expect(after[0]!.updated_at.getTime()).toBe(before[0]!.updated_at.getTime());
    });

    it('7. member (seed) sending PATCH -> 403 FORBIDDEN, even with invalid name', async () => {
      const { workspace } = await seedWorkspace('owner7@openplany.dev', 'ws-member-test');
      const memberId = await createUser('member1@openplany.dev');
      const memberCookie = await signInCookie('member1@openplany.dev');

      await e2e.dataSource.query(
        'INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
        [workspace.id, memberId, 'member'],
      );

      // Valid name -> 403
      const resValid = await http()
        .patch('/api/workspaces/ws-member-test')
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Hacked Name' })
        .expect(403);
      expect(resValid.body.code).toBe('FORBIDDEN');

      // Empty name -> still 403 (Guard runs before validation pipe)
      const resEmpty = await http()
        .patch('/api/workspaces/ws-member-test')
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({ name: '' })
        .expect(403);
      expect(resEmpty.body.code).toBe('FORBIDDEN');
    });

    it('8. non-member or nonexistent slug -> 404 with identical body', async () => {
      await createUser('outsider@openplany.dev');
      const outsiderCookie = await signInCookie('outsider@openplany.dev');
      await seedWorkspace('owner8@openplany.dev', 'ws-secret');

      const resSecret = await http()
        .patch('/api/workspaces/ws-secret')
        .set('Cookie', outsiderCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Outsider Try' })
        .expect(404);

      const resNonExistent = await http()
        .patch('/api/workspaces/does-not-exist')
        .set('Cookie', outsiderCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Outsider Try' })
        .expect(404);

      expect(resSecret.body.code).toBe('NOT_FOUND');
      expect(resNonExistent.body.code).toBe('NOT_FOUND');
    });

    it('9. two admins concurrently update {name} and {timezone} -> both 200 and kept', async () => {
      const { workspace } = await seedWorkspace('owner9@openplany.dev', 'ws-concurrent');

      const admin1Id = await createUser('admin1@openplany.dev');
      const admin1Cookie = await signInCookie('admin1@openplany.dev');
      await e2e.dataSource.query(
        'INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
        [workspace.id, admin1Id, 'admin'],
      );

      const admin2Id = await createUser('admin2@openplany.dev');
      const admin2Cookie = await signInCookie('admin2@openplany.dev');
      await e2e.dataSource.query(
        'INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
        [workspace.id, admin2Id, 'admin'],
      );

      const [res1, res2] = await Promise.all([
        http()
          .patch('/api/workspaces/ws-concurrent')
          .set('Cookie', admin1Cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'Concurrent Name' }),
        http()
          .patch('/api/workspaces/ws-concurrent')
          .set('Cookie', admin2Cookie)
          .set('Origin', ORIGIN)
          .send({ timezone: 'Asia/Ho_Chi_Minh' }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const rows = await e2e.dataSource.query<{ name: string; timezone: string }[]>(
        'SELECT name, timezone FROM workspaces WHERE id = $1',
        [workspace.id],
      );
      expect(rows[0]!.name).toBe('Concurrent Name');
      expect(rows[0]!.timezone).toBe('Asia/Ho_Chi_Minh');
    });

    it('10. 31 requests within 10 minutes -> 31st request gets 429 and Retry-After header', async () => {
      const { cookie } = await seedWorkspace('owner10@openplany.dev', 'ws-rate-limit');

      for (let i = 0; i < 30; i++) {
        // Send requests (even to non-existent slug to count toward user limiter)
        await http()
          .patch('/api/workspaces/non-existent-slug')
          .set('Cookie', cookie)
          .set('Origin', ORIGIN)
          .send({ name: 'Some Name' });
      }

      const res31 = await http()
        .patch('/api/workspaces/ws-rate-limit')
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Request 31' })
        .expect(429);

      expect(res31.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(res31.headers['retry-after']).toBeDefined();
    });

    it('11. unauthenticated / reset-only / bad origin -> 401 / 403 / 403', async () => {
      await seedWorkspace('owner11@openplany.dev', 'ws-auth-checks');

      // No cookie
      await http()
        .patch('/api/workspaces/ws-auth-checks')
        .set('Origin', ORIGIN)
        .send({ name: 'No Cookie' })
        .expect(401);

      // Password reset required
      await createUser('resetuser@openplany.dev', 'UTC', { is_password_reset_required: true });
      const resetCookie = await signInCookie('resetuser@openplany.dev');
      await http()
        .patch('/api/workspaces/ws-auth-checks')
        .set('Cookie', resetCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Reset Only' })
        .expect(403);

      // Bad origin
      const ownerCookie = await signInCookie('owner11@openplany.dev');
      await http()
        .patch('/api/workspaces/ws-auth-checks')
        .set('Cookie', ownerCookie)
        .set('Origin', 'http://malicious.site')
        .send({ name: 'Bad Origin' })
        .expect(403);
    });

    it('12. GET /:slug returns permissions and updatedAt for owner and member', async () => {
      const { workspace, cookie: ownerCookie } = await seedWorkspace('owner12@openplany.dev', 'ws-get-perm');
      const memberId = await createUser('member12@openplany.dev');
      const memberCookie = await signInCookie('member12@openplany.dev');
      await e2e.dataSource.query(
        'INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
        [workspace.id, memberId, 'member'],
      );

      const ownerRes = await http()
        .get('/api/workspaces/ws-get-perm')
        .set('Cookie', ownerCookie)
        .expect(200);
      expect(ownerRes.body.permissions).toEqual([
        'workspace.settings.update',
        'workspace.members.view',
        'workspace.members.email.view',
      ]);
      expect(ownerRes.body.updatedAt).toBeDefined();

      const memberRes = await http()
        .get('/api/workspaces/ws-get-perm')
        .set('Cookie', memberCookie)
        .expect(200);
      expect(memberRes.body.permissions).toEqual(['workspace.members.view']);
      expect(memberRes.body.updatedAt).toBeDefined();
    });

    it('13. AC-26: workspace permissions read from DB and take immediate effect', async () => {
      const { workspace, cookie: adminCookie } = await seedWorkspace('admin13@openplany.dev', 'ws-perm-db');
      const memberId = await createUser('member13@openplany.dev');
      const memberCookie = await signInCookie('member13@openplany.dev');
      await e2e.dataSource.query(
        'INSERT INTO workspace_members (workspace_id, member_id, role, created_at, updated_at) VALUES ($1, $2, $3, now(), now())',
        [workspace.id, memberId, 'member'],
      );

      // Default state: Admin has 3 permissions, Member has workspace.members.view
      let adminRes = await http().get('/api/workspaces/ws-perm-db').set('Cookie', adminCookie).expect(200);
      expect(adminRes.body.permissions).toEqual([
        'workspace.settings.update',
        'workspace.members.view',
        'workspace.members.email.view',
      ]);
      let memberRes = await http().get('/api/workspaces/ws-perm-db').set('Cookie', memberCookie).expect(200);
      expect(memberRes.body.permissions).toEqual(['workspace.members.view']);

      // 1. Revoke workspace.settings.update from Admin in DB
      await e2e.dataSource.query(
        "DELETE FROM role_permissions WHERE scope = 'workspace' AND role_key = 'admin' AND permission_key = 'workspace.settings.update'",
      );

      // Admin immediately loses settings.update permission in GET response
      adminRes = await http().get('/api/workspaces/ws-perm-db').set('Cookie', adminCookie).expect(200);
      expect(adminRes.body.permissions).toEqual([
        'workspace.members.view',
        'workspace.members.email.view',
      ]);

      // Admin trying to update workspace settings gets 403 FORBIDDEN immediately
      await http()
        .patch('/api/workspaces/ws-perm-db')
        .set('Cookie', adminCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Admin Forbidden Edit' })
        .expect(403);

      // 2. Grant workspace.settings.update to Member in DB
      await e2e.dataSource.query(
        "INSERT INTO role_permissions (scope, role_key, permission_key, created_at) VALUES ('workspace', 'member', 'workspace.settings.update', now())",
      );

      // Member immediately gets permission in GET response
      memberRes = await http().get('/api/workspaces/ws-perm-db').set('Cookie', memberCookie).expect(200);
      expect(memberRes.body.permissions).toEqual([
        'workspace.settings.update',
        'workspace.members.view',
      ]);

      // Member can now update workspace settings
      await http()
        .patch('/api/workspaces/ws-perm-db')
        .set('Cookie', memberCookie)
        .set('Origin', ORIGIN)
        .send({ name: 'Member Allowed Edit' })
        .expect(200);

      // 3. Unknown/foreign permissions in DB do not leak to response
      await e2e.dataSource.query(
        "INSERT INTO permissions (key, scope, label) VALUES ('workspace.unrecognized.custom', 'workspace', 'Custom permission') ON CONFLICT (key) DO NOTHING",
      );
      await e2e.dataSource.query(
        "INSERT INTO role_permissions (scope, role_key, permission_key, created_at) VALUES ('workspace', 'member', 'workspace.unrecognized.custom', now()) ON CONFLICT DO NOTHING",
      );
      memberRes = await http().get('/api/workspaces/ws-perm-db').set('Cookie', memberCookie).expect(200);
      expect(memberRes.body.permissions).toEqual([
        'workspace.settings.update',
        'workspace.members.view',
      ]);
    });
  });
});

