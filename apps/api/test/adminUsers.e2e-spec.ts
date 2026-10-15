import request from 'supertest';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const DEFAULT_PASSWORD = 'Secret123!';

describe('Admin Users (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(DEFAULT_PASSWORD);
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function createDbUser(
    email: string,
    isSuperuser = false,
    pwdHash = passwordHash,
  ): Promise<string> {
    const rows = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (
        email, username, password, first_name, last_name, display_name,
        is_superuser, is_staff, is_email_verified,
        is_password_autoset, is_password_reset_required, is_password_expired,
        date_joined, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'Test', 'User', 'Test User',
        $4, $4, true,
        false, false, false,
        now(), now(), now()
      )
      RETURNING id`,
      [email.toLowerCase(), email.toLowerCase().replace(/[^a-z0-9]/g, ''), pwdHash, isSuperuser],
    );
    return rows[0]!.id;
  }

  async function signInCookie(
    email: string,
    password = DEFAULT_PASSWORD,
  ): Promise<string> {
    const response = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password })
      .expect(200);
    const cookies: string[] = response.headers['set-cookie'] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('op_session='));
    if (cookie === undefined) throw new Error('No session cookie was set');
    return cookie.split(';')[0];
  }

  it('DBT-01: migration adds created_by_id column as nullable uuid', async () => {
    const columns = await e2e.dataSource.query<
      { column_name: string; data_type: string; is_nullable: string }[]
    >(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_name = 'users' AND column_name = 'created_by_id'`,
    );
    expect(columns).toHaveLength(1);
    expect(columns[0]!.data_type).toBe('uuid');
    expect(columns[0]!.is_nullable).toBe('YES');
  });

  it('AC-03: regular user is rejected with 403 FORBIDDEN and users count is unchanged', async () => {
    await createDbUser('regular@openplany.dev', false);
    const cookie = await signInCookie('regular@openplany.dev');

    const countBefore = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM users',
    );

    // With valid body
    const res1 = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
      })
      .expect(403);
    expect(res1.body.code).toBe('FORBIDDEN');
    expect(res1.body.message).toBe("You don't have permission to create users");

    // With empty body (guard runs before pipe)
    const res2 = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({})
      .expect(403);
    expect(res2.body.code).toBe('FORBIDDEN');

    const countAfter = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM users',
    );
    expect(countAfter[0]!.count).toBe(countBefore[0]!.count);
  });

  it('AC-04: demoting a superuser in DB immediately blocks next request with 403', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    // Demote superuser in DB
    await e2e.dataSource.query(
      "UPDATE users SET is_superuser = false WHERE email = 'admin@openplany.dev'",
    );

    const res = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
      })
      .expect(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('AC-06: superuser creates user successfully with 201, no-store, and DB row matches spec', async () => {
    const adminId = await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const response = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: '  An  ',
        lastName: '  Nguyen  ',
        displayName: '  An Nguyen  ',
        email: '  An@OpenPlany.dev  ',
        password: 'correct horse battery',
      })
      .expect(201);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['location']).toBeUndefined();

    expect(response.body).toEqual({
      id: expect.any(String),
      email: 'an@openplany.dev',
      firstName: 'An',
      lastName: 'Nguyen',
      displayName: 'An Nguyen',
      isInstanceAdmin: false,
      createdAt: expect.any(String),
    });
    expect(response.body.password).toBeUndefined();
    expect(response.body.username).toBeUndefined();
    expect(response.body.createdById).toBeUndefined();

    // Verify database row
    const rows = await e2e.dataSource.query<
      {
        id: string;
        email: string;
        username: string;
        password: string;
        first_name: string;
        last_name: string;
        display_name: string;
        is_superuser: boolean;
        is_staff: boolean;
        is_email_verified: boolean;
        is_password_autoset: boolean;
        is_password_reset_required: boolean;
        is_password_expired: boolean;
        created_by_id: string;
        date_joined: Date;
        created_at: Date;
        updated_at: Date;
      }[]
    >('SELECT * FROM users WHERE email = $1', ['an@openplany.dev']);

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe(response.body.id);
    expect(row.email).toBe('an@openplany.dev');
    expect(row.username).toMatch(/^[0-9a-f]{32}$/);
    expect(row.password).toMatch(/^\$argon2id\$/);
    expect(row.first_name).toBe('An');
    expect(row.last_name).toBe('Nguyen');
    expect(row.display_name).toBe('An Nguyen');
    expect(row.is_superuser).toBe(false);
    expect(row.is_staff).toBe(false);
    expect(row.is_email_verified).toBe(false);
    expect(row.is_password_autoset).toBe(false);
    expect(row.is_password_reset_required).toBe(false);
    expect(row.is_password_expired).toBe(false);
    expect(row.created_by_id).toBe(adminId);
    expect(new Date(row.date_joined).getTime()).toBe(new Date(row.created_at).getTime());
    expect(new Date(row.updated_at).getTime()).toBe(new Date(row.created_at).getTime());
  });

  it('AC-07: created user can sign in and requires no password reset', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'New',
        displayName: 'New User',
        email: 'newuser@openplany.dev',
        password: 'ValidPassword123!',
      })
      .expect(201);

    const signInRes = await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email: 'newuser@openplany.dev', password: 'ValidPassword123!' })
      .expect(200);

    expect(signInRes.body.requiresPasswordReset).toBe(false);
    expect(signInRes.body.user.isInstanceAdmin).toBe(false);
    expect(signInRes.body.user.email).toBe('newuser@openplany.dev');
  });

  it('AC-08: rejects forbidden fields with 400 forbidNonWhitelisted', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const res = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
        isSuperuser: true,
        role: 'admin',
        workspaceSlug: 'ws-1',
        confirmPassword: 'password123',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('AC-09: duplicate email with different casing returns 409 EMAIL_ALREADY_EXISTS', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    // Create user first
    await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
      })
      .expect(201);

    // Try to create with uppercase email
    const res = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'AN@OPENPLANY.DEV',
        password: 'password456',
      })
      .expect(409);

    expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(res.body.message).toBe('A user with this email already exists.');
    expect(res.body.fields).toEqual({
      email: 'A user with this email already exists.',
    });
  });

  it('AC-10: concurrent requests with identical email yield exactly one 201 and one 409', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const body1 = {
      firstName: 'An',
      displayName: 'An',
      email: 'concurrent@openplany.dev',
      password: 'password123',
    };
    const body2 = {
      firstName: 'An',
      displayName: 'An',
      email: 'CONCURRENT@openplany.dev',
      password: 'password456',
    };

    const [res1, res2] = await Promise.all([
      http().post('/api/admin/users').set('Origin', ORIGIN).set('Cookie', cookie).send(body1),
      http().post('/api/admin/users').set('Origin', ORIGIN).set('Cookie', cookie).send(body2),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const users = await e2e.dataSource.query<{ id: string }[]>(
      "SELECT id FROM users WHERE lower(email) = 'concurrent@openplany.dev'",
    );
    expect(users).toHaveLength(1);
  });

  it('AC-11: invalid body returns 400 with fields', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const res = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: '',
        displayName: 'a'.repeat(51),
        email: 'not-an-email',
        password: 'password123',
      })
      .expect(400);

    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.fields).toHaveProperty('firstName');
    expect(res.body.fields).toHaveProperty('displayName');
    expect(res.body.fields).toHaveProperty('email');
  });

  it('AC-13 & AC-15: password length and password-email equality validation', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    // 7 characters
    const shortRes = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'user1@openplany.dev',
        password: '1234567',
      })
      .expect(400);
    expect(shortRes.body.fields.password).toBe('Use 8 to 128 characters');

    // 129 characters
    const longRes = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'user2@openplany.dev',
        password: 'a'.repeat(129),
      })
      .expect(400);
    expect(longRes.body.fields.password).toBe('Use 8 to 128 characters');

    // Password equals email
    const sameRes = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'user3@openplany.dev',
        password: 'USER3@OPENPLANY.DEV',
      })
      .expect(400);
    expect(sameRes.body.fields.password).toBe("Password can't be the same as the email");
  });

  it('AC-16: password with leading and trailing spaces is preserved exactly', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const passwordWithSpaces = '   padded secret 123   ';

    await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'Padded',
        displayName: 'Padded',
        email: 'padded@openplany.dev',
        password: passwordWithSpaces,
      })
      .expect(201);

    // Sign in with exact whitespace password succeeds
    await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email: 'padded@openplany.dev', password: passwordWithSpaces })
      .expect(200);

    // Sign in with trimmed password fails
    await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email: 'padded@openplany.dev', password: 'padded secret 123' })
      .expect(401);
  });

  it('AC-17: logs contain zero PII (no passwords, emails, or names) and exactly 1 user.created', async () => {
    const loggedMessages: string[] = [];
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation((msg: string) => {
      loggedMessages.push(String(msg));
    });
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((msg: string) => {
      loggedMessages.push(String(msg));
    });
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation((msg: string) => {
      loggedMessages.push(String(msg));
    });

    try {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      const piiEmail = 'pii-target@openplany.dev';
      const piiFirst = 'SuperSecretFirstName';
      const piiPassword = 'TopSecretPassword999!';

      await http()
        .post('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          firstName: piiFirst,
          displayName: 'PII Target',
          email: piiEmail,
          password: piiPassword,
        })
        .expect(201);

      // Verify no logged message contains PII
      for (const logMsg of loggedMessages) {
        expect(logMsg).not.toContain(piiEmail);
        expect(logMsg).not.toContain(piiFirst);
        expect(logMsg).not.toContain(piiPassword);
      }

      // Verify user.created format
      const createdLogs = loggedMessages.filter((m) => m.startsWith('user.created'));
      expect(createdLogs).toHaveLength(1);
      expect(createdLogs[0]).toMatch(
        /^user\.created userId=[0-9a-f-]+ actorId=[0-9a-f-]+ requestId=/,
      );
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('INV-06: rejects unauthenticated requests with 401 and untrusted origins with 403', async () => {
    // Unauthenticated
    const unauth = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
      })
      .expect(401);
    expect(unauth.body.code).toBe('UNAUTHENTICATED');

    // Untrusted origin
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');
    const evilOrigin = await http()
      .post('/api/admin/users')
      .set('Origin', 'http://malicious.site')
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'an@openplany.dev',
        password: 'password123',
      })
      .expect(403);
    expect(evilOrigin.body.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('INV-05 & DBT-04: creating user does not create any workspace_members rows', async () => {
    await createDbUser('admin@openplany.dev', true);
    const cookie = await signInCookie('admin@openplany.dev');

    const countBefore = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM workspace_members',
    );

    await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'An',
        displayName: 'An',
        email: 'noworkspace@openplany.dev',
        password: 'password123',
      })
      .expect(201);

    const countAfter = await e2e.dataSource.query<{ count: string }[]>(
      'SELECT count(*) FROM workspace_members',
    );
    expect(countAfter[0]!.count).toBe(countBefore[0]!.count);
  });

  it('AC-12: enforces 20 users per 10 minutes rate limit on dedicated superuser', async () => {
    await createDbUser('rate-admin@openplany.dev', true);
    const cookie = await signInCookie('rate-admin@openplany.dev');

    // 20 successful creates
    for (let i = 1; i <= 20; i++) {
      await http()
        .post('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          firstName: `User${i}`,
          displayName: `User ${i}`,
          email: `user${i}_rate@openplany.dev`,
          password: 'ValidPassword123!',
        })
        .expect(201);
    }

    // 21st request is rate limited
    const res21 = await http()
      .post('/api/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        firstName: 'User21',
        displayName: 'User 21',
        email: 'user21_rate@openplany.dev',
        password: 'ValidPassword123!',
      })
      .expect(429);

    expect(res21.body.code).toBe('TOO_MANY_ATTEMPTS');
    expect(res21.body.message).toBe('Too many users created. Try again later.');
    expect(res21.headers['retry-after']).toBeDefined();
    expect(res21.body.retryAfterSeconds).toBeDefined();
  });

  describe('GET /api/admin/users', () => {
    it('returns 401 for unauthenticated request', async () => {
      const res = await http()
        .get('/api/admin/users')
        .set('Origin', ORIGIN)
        .expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns 403 with cannotManageUsers message for non-instance admin (AC-02)', async () => {
      await createDbUser('regular@openplany.dev', false);
      const cookie = await signInCookie('regular@openplany.dev');

      const res = await http()
        .get('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe("You don't have permission to manage users");

      // With Vietnamese language
      const resVi = await http()
        .get('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .set('Accept-Language', 'vi')
        .expect(403);

      expect(resVi.body.code).toBe('FORBIDDEN');
      expect(resVi.body.message).toBe("Bạn không có quyền quản lý người dùng");
    });

    it('returns listed users sorted by createdAt desc, id desc with pagination and excludes bots and masked users (INV-02, INV-03, AC-03, AC-04, AC-05)', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // Create active user
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active, is_bot, masked_at,
          created_at, updated_at
        ) VALUES (
          '11111111-1111-4111-8111-111111111111', 'active@openplany.dev', 'activeuser',
          $1, 'Active', 'User', 'Active User',
          false, false, true, true, false, null,
          now() - interval '2 days', now() - interval '2 days'
        )`,
        [passwordHash],
      );

      // Create deactivated user (should be included, AC-04)
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active, is_bot, masked_at,
          created_at, updated_at
        ) VALUES (
          '22222222-2222-4222-8222-222222222222', 'deactivated@openplany.dev', 'deactivateduser',
          $1, 'Deactivated', 'User', 'Deactivated User',
          false, false, true, false, false, null,
          now() - interval '1 day', now() - interval '1 day'
        )`,
        [passwordHash],
      );

      // Create bot user (should be excluded, INV-02, AC-04)
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active, is_bot, masked_at,
          created_at, updated_at
        ) VALUES (
          '33333333-3333-4333-8333-333333333333', 'bot@openplany.dev', 'botuser',
          $1, 'Bot', 'User', 'Bot User',
          false, false, true, true, true, null,
          now(), now()
        )`,
        [passwordHash],
      );

      // Create masked user (should be excluded, INV-02, AC-04)
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active, is_bot, masked_at,
          created_at, updated_at
        ) VALUES (
          '44444444-4444-4444-8444-444444444444', 'masked@openplany.dev', 'maskeduser',
          $1, 'Masked', 'User', 'Masked User',
          false, false, true, true, false, now(),
          now(), now()
        )`,
        [passwordHash],
      );

      const res = await http()
        .get('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.pageSize).toBe(50);
      expect(res.body.page).toBe(1);
      // Admin + active + deactivated = 3 listed users
      expect(res.body.total).toBe(3);
      expect(res.body.items).toHaveLength(3);

      const emails = res.body.items.map((u: { email: string }) => u.email);
      expect(emails).not.toContain('bot@openplany.dev');
      expect(emails).not.toContain('masked@openplany.dev');
      expect(emails).toContain('admin@openplany.dev');
      expect(emails).toContain('deactivated@openplany.dev');
      expect(emails).toContain('active@openplany.dev');

      // Check fields for AC-03
      const first = res.body.items[0];
      expect(first).not.toHaveProperty('password');
      expect(first).not.toHaveProperty('username');
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('email');
      expect(first).toHaveProperty('firstName');
      expect(first).toHaveProperty('lastName');
      expect(first).toHaveProperty('displayName');
      expect(first).toHaveProperty('avatarUrl');
      expect(first).toHaveProperty('isActive');
      expect(first).toHaveProperty('isInstanceAdmin');
      expect(first).toHaveProperty('createdAt');
      expect(first).toHaveProperty('updatedAt');

      // Verify page beyond total returns items: [] and correct total (AC-05)
      const resPage10 = await http()
        .get('/api/admin/users?page=10')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      expect(resPage10.body.page).toBe(10);
      expect(resPage10.body.total).toBe(3);
      expect(resPage10.body.items).toEqual([]);
    });

    it('returns 400 with fields for invalid query parameters (API B3.1, AC-22)', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // Invalid page: 0
      const resPage0 = await http()
        .get('/api/admin/users?page=0')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resPage0.body.code).toBe('VALIDATION_ERROR');
      expect(resPage0.body.fields).toHaveProperty('page');

      // Invalid page: negative
      const resPageNeg = await http()
        .get('/api/admin/users?page=-5')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resPageNeg.body.code).toBe('VALIDATION_ERROR');
      expect(resPageNeg.body.fields).toHaveProperty('page');

      // Invalid page: string
      const resPageStr = await http()
        .get('/api/admin/users?page=abc')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resPageStr.body.code).toBe('VALIDATION_ERROR');
      expect(resPageStr.body.fields).toHaveProperty('page');

      // Invalid page: exponential notation 1e3
      const resPageExp = await http()
        .get('/api/admin/users?page=1e3')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resPageExp.body.code).toBe('VALIDATION_ERROR');
      expect(resPageExp.body.fields).toHaveProperty('page');

      // Invalid page: float 1.5
      const resPageFloat = await http()
        .get('/api/admin/users?page=1.5')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resPageFloat.body.code).toBe('VALIDATION_ERROR');
      expect(resPageFloat.body.fields).toHaveProperty('page');

      // Invalid sort
      const resSort = await http()
        .get('/api/admin/users?sort=invalid_sort')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resSort.body.code).toBe('VALIDATION_ERROR');
      expect(resSort.body.fields).toHaveProperty('sort');

      // Invalid order
      const resOrder = await http()
        .get('/api/admin/users?order=diagonal')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resOrder.body.code).toBe('VALIDATION_ERROR');
      expect(resOrder.body.fields).toHaveProperty('order');

      // Invalid status
      const resStatus = await http()
        .get('/api/admin/users?status=banned')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resStatus.body.code).toBe('VALIDATION_ERROR');
      expect(resStatus.body.fields).toHaveProperty('status');

      // Invalid instanceAdmin
      const resAdmin = await http()
        .get('/api/admin/users?instanceAdmin=true')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resAdmin.body.code).toBe('VALIDATION_ERROR');
      expect(resAdmin.body.fields).toHaveProperty('instanceAdmin');

      // Search too long (> 100 characters)
      const resSearchLong = await http()
        .get(`/api/admin/users?search=${'a'.repeat(101)}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resSearchLong.body.code).toBe('VALIDATION_ERROR');
      expect(resSearchLong.body.fields).toHaveProperty('search');

      // Search with control character
      const resSearchControl = await http()
        .get('/api/admin/users?search=hello%00world')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);
      expect(resSearchControl.body.code).toBe('VALIDATION_ERROR');
      expect(resSearchControl.body.fields).toHaveProperty('search');
    });

    it('searches users accent-insensitively, multi-word, and treats wildcards as literals (DB B3, RQ INV-04, AC-06, AC-22)', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // User 1: Nguyễn Văn An
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'nguyen.an@openplany.dev', 'nguyenan',
          $1, 'Nguyễn', 'Văn An', 'Nguyễn Văn An',
          false, false, true, true,
          now() - interval '3 days', now() - interval '3 days'
        )`,
        [passwordHash],
      );

      // User 2: Đặng Quốc Bình
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'dang.binh@openplany.dev', 'dangbinh',
          $1, 'Đặng', 'Quốc Bình', 'Đặng Quốc Bình',
          false, false, true, true,
          now() - interval '2 days', now() - interval '2 days'
        )`,
        [passwordHash],
      );

      // User 3: User with percent and underscore in email or name
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'test_100%@openplany.dev', 'test100',
          $1, 'Test', '100%_Special', 'Test 100%_Special',
          false, false, true, true,
          now() - interval '1 day', now() - interval '1 day'
        )`,
        [passwordHash],
      );

      // "nguyen" -> matches "Nguyễn Văn An"
      const resNguyen = await http()
        .get('/api/admin/users?search=nguyen')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resNguyen.body.items).toHaveLength(1);
      expect(resNguyen.body.items[0].email).toBe('nguyen.an@openplany.dev');

      // "dang" -> matches "Đặng Quốc Bình"
      const resDang = await http()
        .get('/api/admin/users?search=dang')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resDang.body.items).toHaveLength(1);
      expect(resDang.body.items[0].email).toBe('dang.binh@openplany.dev');

      // Multi-word "nguyen an" -> matches "Nguyễn Văn An"
      const resMulti = await http()
        .get('/api/admin/users?search=nguyen%20an')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resMulti.body.items).toHaveLength(1);
      expect(resMulti.body.items[0].email).toBe('nguyen.an@openplany.dev');

      // Literal "%" match -> matches only the user with literal "%"
      const resPercent = await http()
        .get('/api/admin/users?search=%25')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resPercent.body.items).toHaveLength(1);
      expect(resPercent.body.items[0].email).toBe('test_100%@openplany.dev');

      // Literal "_" match -> matches only the user with literal "_"
      const resUnderscore = await http()
        .get('/api/admin/users?search=_')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resUnderscore.body.items).toHaveLength(1);
      expect(resUnderscore.body.items[0].email).toBe('test_100%@openplany.dev');

      // Fullwidth '％' -> unaccent converts to literal '%', matches only user with literal '%' (NOT a wildcard matching all users)
      const resFullwidth = await http()
        .get('/api/admin/users?search=%EF%BC%85')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resFullwidth.body.items).toHaveLength(1);
      expect(resFullwidth.body.items[0].email).toBe('test_100%@openplany.dev');
    });

    it('filters users by status and instanceAdmin (RQ INV-03, AC-07)', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // Active regular user
      await createDbUser('user1@openplany.dev', false);

      // Deactivated user
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          '22222222-2222-4222-8222-222222222222', 'deactivated@openplany.dev', 'deactivateduser',
          $1, 'Deactivated', 'User', 'Deactivated User',
          false, false, true, false,
          now(), now()
        )`,
        [passwordHash],
      );

      // Filter status=active
      const resActive = await http()
        .get('/api/admin/users?status=active')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resActive.body.total).toBe(2); // admin + user1
      expect(resActive.body.items.every((u: { isActive: boolean }) => u.isActive)).toBe(true);

      // Filter status=deactivated
      const resDeactivated = await http()
        .get('/api/admin/users?status=deactivated')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resDeactivated.body.total).toBe(1);
      expect(resDeactivated.body.items[0].email).toBe('deactivated@openplany.dev');

      // Filter instanceAdmin=only
      const resAdmins = await http()
        .get('/api/admin/users?instanceAdmin=only')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      expect(resAdmins.body.total).toBe(1);
      expect(resAdmins.body.items[0].email).toBe('admin@openplany.dev');
    });

    it('sorts columns with empty and NULL values always last in both ASC and DESC (RQ INV-03, AC-08)', async () => {
      await createDbUser('admin@openplany.dev', true);
      const cookie = await signInCookie('admin@openplany.dev');

      // User with first name 'Alice'
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'alice@openplany.dev', 'alice',
          $1, 'Alice', 'Smith', 'Alice Smith',
          false, false, true, true,
          now() - interval '3 days', now() - interval '3 days'
        )`,
        [passwordHash],
      );

      // User with first name 'Zoe'
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'zoe@openplany.dev', 'zoe',
          $1, 'Zoe', 'Taylor', 'Zoe Taylor',
          false, false, true, true,
          now() - interval '2 days', now() - interval '2 days'
        )`,
        [passwordHash],
      );

      // User with empty/null names
      await e2e.dataSource.query(
        `INSERT INTO users (
          id, email, username, password, first_name, last_name, display_name,
          is_superuser, is_staff, is_email_verified, is_active,
          created_at, updated_at
        ) VALUES (
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'empty@openplany.dev', 'empty',
          $1, '', '', '',
          false, false, true, true,
          now() - interval '1 day', now() - interval '1 day'
        )`,
        [passwordHash],
      );

      // Sort fullName ASC -> Alice, Test User (admin), Zoe, then empty last
      const resAsc = await http()
        .get('/api/admin/users?sort=fullName&order=asc')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      const ascNames = resAsc.body.items.map((u: { firstName: string }) => u.firstName);
      expect(ascNames[0]).toBe('Alice');
      expect(ascNames[ascNames.length - 1]).toBe('');

      // Sort fullName DESC -> Zoe, Test User (admin), Alice, then empty STILL last!
      const resDesc = await http()
        .get('/api/admin/users?sort=fullName&order=desc')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);
      const descNames = resDesc.body.items.map((u: { firstName: string }) => u.firstName);
      expect(descNames[0]).toBe('Zoe');
      expect(descNames[descNames.length - 1]).toBe('');
    });

    it('enforces 120 reads per minute rate limit on GET /api/admin/users (AC-27)', async () => {
      await createDbUser('rate-read-admin@openplany.dev', true);
      const cookie = await signInCookie('rate-read-admin@openplany.dev');

      // Send 120 requests
      for (let i = 1; i <= 120; i++) {
        await http()
          .get('/api/admin/users')
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .expect(200);
      }

      // 121st request hits rate limit 429
      const res121 = await http()
        .get('/api/admin/users')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(429);

      expect(res121.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(res121.body.message).toBe('Too many requests. Please wait a moment and try again.');
      expect(res121.headers['retry-after']).toBeDefined();
      expect(res121.body.retryAfterSeconds).toBeDefined();
    });
  });
});
