import request from 'supertest';
import { describe, beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'Secret123!';

describe('Workspaces (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
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
    const columns = Object.keys(flags);
    const result = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, username, password, first_name, last_name, display_name, user_timezone${columns.map((c) => `, ${c}`).join('')})
       VALUES ($1, $1, $2, 'An', 'Nguyen', 'An Nguyen', $3${columns.map((_, i) => `, $${i + 4}`).join('')})
       RETURNING id`,
      [email, passwordHash, timezone, ...Object.values(flags)],
    );
    return result[0]!.id;
  }

  async function signInCookie(email: string): Promise<string> {
    const response = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((val) => val.startsWith('op_session='));
    if (!cookie) throw new Error('No session cookie found');
    return cookie.split(';')[0]!;
  }

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

  it('3. valid POST creates workspace, owner member, updates last_workspace_id and copies timezone', async () => {
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
      role: 'owner',
      memberCount: 1,
    });
    expect(res.body.id).toBeDefined();

    // Verify DB state
    const workspaces = await e2e.dataSource.query<{ id: string; owner_id: string; timezone: string }[]>(
      'SELECT id, owner_id, timezone FROM workspaces WHERE slug = $1',
      ['acme-corp'],
    );
    expect(workspaces).toHaveLength(1);
    expect(workspaces[0]!.owner_id).toBe(userId);
    expect(workspaces[0]!.timezone).toBe('Asia/Ho_Chi_Minh');

    const members = await e2e.dataSource.query<{ role: string; member_id: string }[]>(
      'SELECT role, member_id FROM workspace_members WHERE workspace_id = $1',
      [workspaces[0]!.id],
    );
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe('owner');
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

    const testSlugs = ['admin', 'slug-check', 'Acme', 'ab', 'a--b'];
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
    expect(getRes.body.role).toBe('owner');

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
});
