import request from 'supertest';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IsNull } from 'typeorm';
import { Session } from '../src/auth/entities/session.entity.js';
import { User } from '../src/auth/entities/user.entity.js';
import { Argon2PasswordHasher, PasswordHasher } from '../src/auth/passwordHasher.js';
import { SessionsRepository } from '../src/auth/repositories/sessionsRepository.js';
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

  /** Waits until `count` backends of this database wait on a row lock (catalog read, e2e only). */
  async function waitForLockWaiters(count: number): Promise<void> {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const rows = await e2e.dataSource.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`,
      );
      if ((rows[0]?.n ?? 0) >= count) return;
      if (Date.now() > deadline) throw new Error(`Expected ${count} lock waiters`);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
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
      expect(res121.body.message).toBe('Too many requests. Try again in 1 minute.');
      expect(res121.headers['retry-after']).toBeDefined();
      expect(res121.body.retryAfterSeconds).toBeDefined();
    });
  });

  describe('GET /api/admin/users/:userId (API-02)', () => {
    it('returns 200 with full AdminUserResponse for listed user', async () => {
      await createDbUser('admin-get@openplany.dev', true);
      const cookie = await signInCookie('admin-get@openplany.dev');

      const targetId = await createDbUser('target-get@openplany.dev', false);

      const res = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          id: targetId,
          email: 'target-get@openplany.dev',
          firstName: 'Test',
          lastName: 'User',
          displayName: 'Test User',
          isActive: true,
          isInstanceAdmin: false,
        }),
      );
      expect(res.body.createdAt).toBeDefined();
      expect(res.body.updatedAt).toBeDefined();
    });

    it('returns 404 USER_NOT_FOUND when user does not exist', async () => {
      await createDbUser('admin-get-404@openplany.dev', true);
      const cookie = await signInCookie('admin-get-404@openplany.dev');

      const nonExistent = '00000000-0000-4000-8000-000000000000';
      const res = await http()
        .get(`/api/admin/users/${nonExistent}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(404);

      expect(res.body.code).toBe('USER_NOT_FOUND');
      expect(res.body.message).toBe('This user no longer exists.');
    });

    it('returns 404 USER_NOT_FOUND when target user is a bot', async () => {
      await createDbUser('admin-bot@openplany.dev', true);
      const cookie = await signInCookie('admin-bot@openplany.dev');

      const botId = await createDbUser('bot-user@openplany.dev', false);
      await e2e.dataSource.query('UPDATE users SET is_bot = true WHERE id = $1', [botId]);

      const res = await http()
        .get(`/api/admin/users/${botId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(404);

      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('returns 404 USER_NOT_FOUND when target user is masked', async () => {
      await createDbUser('admin-masked@openplany.dev', true);
      const cookie = await signInCookie('admin-masked@openplany.dev');

      const maskedId = await createDbUser('masked-user@openplany.dev', false);
      await e2e.dataSource.query('UPDATE users SET masked_at = now() WHERE id = $1', [maskedId]);

      const res = await http()
        .get(`/api/admin/users/${maskedId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(404);

      expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    it('returns 403 FORBIDDEN when non-admin calls GET :userId', async () => {
      await createDbUser('regular-get@openplany.dev', false);
      const cookie = await signInCookie('regular-get@openplany.dev');
      const targetId = await createDbUser('target-user@openplany.dev', false);

      const res = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toBe("You don't have permission to manage users");
    });

    it('returns 400 VALIDATION_ERROR when :userId is not a valid uuid v4', async () => {
      await createDbUser('admin-invalid-uuid@openplany.dev', true);
      const cookie = await signInCookie('admin-invalid-uuid@openplany.dev');

      const res = await http()
        .get('/api/admin/users/not-a-valid-uuid')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(400);

      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields.userId).toBeDefined();
    });
  });

  describe('PATCH /api/admin/users/:userId (API-03, DB B5)', () => {
    it('updates user fields, resets isEmailVerified on email change, and emits log', async () => {
      const loggedMessages: string[] = [];
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation((msg: string) => {
        loggedMessages.push(String(msg));
      });

      try {
        await createDbUser('admin-patch@openplany.dev', true);
        const cookie = await signInCookie('admin-patch@openplany.dev');

        const targetId = await createDbUser('target-patch@openplany.dev', false);

        // Fetch detail to get expectedUpdatedAt
        const getRes = await http()
          .get(`/api/admin/users/${targetId}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .expect(200);

        const patchRes = await http()
          .patch(`/api/admin/users/${targetId}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .send({
            expectedUpdatedAt: getRes.body.updatedAt,
            firstName: 'Binh',
            lastName: 'Tran',
            displayName: 'Binh Tran',
            email: 'binh.new@openplany.dev',
          })
          .expect(200);

        expect(patchRes.body.firstName).toBe('Binh');
        expect(patchRes.body.lastName).toBe('Tran');
        expect(patchRes.body.displayName).toBe('Binh Tran');
        expect(patchRes.body.email).toBe('binh.new@openplany.dev');

        // Check DB row: email verified must be false after email change
        const dbRows = await e2e.dataSource.query<{ is_email_verified: boolean }[]>(
          'SELECT is_email_verified FROM users WHERE id = $1',
          [targetId],
        );
        expect(dbRows[0]!.is_email_verified).toBe(false);

        // Check user.updated log
        const updateLogs = loggedMessages.filter((m) => m.startsWith('user.updated'));
        expect(updateLogs).toHaveLength(1);
        expect(updateLogs[0]).toContain(`userId=${targetId}`);
        expect(updateLogs[0]).toContain('fields=firstName,lastName,displayName,email');
        expect(updateLogs[0]).not.toContain('binh.new@openplany.dev');
        expect(updateLogs[0]).not.toContain('Binh');
      } finally {
        logSpy.mockRestore();
      }
    });

    it('updating only name fields preserves isEmailVerified', async () => {
      await createDbUser('admin-name-patch@openplany.dev', true);
      const cookie = await signInCookie('admin-name-patch@openplany.dev');

      const targetId = await createDbUser('target-name@openplany.dev', false);

      const getRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: getRes.body.updatedAt,
          firstName: 'Renamed',
        })
        .expect(200);

      const dbRows = await e2e.dataSource.query<{ is_email_verified: boolean }[]>(
        'SELECT is_email_verified FROM users WHERE id = $1',
        [targetId],
      );
      expect(dbRows[0]!.is_email_verified).toBe(true);
    });

    it('returns 200 without writing when no changes are provided (INV-07)', async () => {
      await createDbUser('admin-noop@openplany.dev', true);
      const cookie = await signInCookie('admin-noop@openplany.dev');

      const targetId = await createDbUser('target-noop@openplany.dev', false);

      const getRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      const patchRes = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: getRes.body.updatedAt,
          firstName: 'Test', // same value
        })
        .expect(200);

      expect(patchRes.body.updatedAt).toBe(getRes.body.updatedAt);
    });

    it('returns 409 USER_CHANGED_SINCE_LOADED when expectedUpdatedAt is stale (AC-10, AC-11)', async () => {
      const warnMessages: string[] = [];
      const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation((msg: string) => {
        warnMessages.push(String(msg));
      });

      try {
        await createDbUser('admin-conflict@openplany.dev', true);
        const cookie = await signInCookie('admin-conflict@openplany.dev');

        const targetId = await createDbUser('target-conflict@openplany.dev', false);

        const staleUpdatedAt = new Date(Date.now() - 60000).toISOString();

        const res = await http()
          .patch(`/api/admin/users/${targetId}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .send({
            expectedUpdatedAt: staleUpdatedAt,
            firstName: 'ConflictName',
          })
          .expect(409);

        expect(res.body.code).toBe('USER_CHANGED_SINCE_LOADED');
        expect(res.body.message).toBe(
          'Someone else updated this user while you were editing. Reload to see the latest details.',
        );

        // Conflict log
        const conflictLogs = warnMessages.filter((m) =>
          m.startsWith('admin.users.update.conflict'),
        );
        expect(conflictLogs).toHaveLength(1);
        expect(conflictLogs[0]).toContain(`userId=${targetId}`);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it('accepts expectedUpdatedAt matching millisecond when DB updated_at has microseconds', async () => {
      await createDbUser('admin-micro@openplany.dev', true);
      const cookie = await signInCookie('admin-micro@openplany.dev');

      const targetId = await createDbUser('target-micro@openplany.dev', false);

      // Set DB updated_at explicitly with microseconds
      await e2e.dataSource.query(
        "UPDATE users SET updated_at = '2026-10-15 12:34:56.789123+00' WHERE id = $1",
        [targetId],
      );

      // Send matching milliseconds
      const res = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: '2026-10-15T12:34:56.789Z',
          firstName: 'MicroUpdated',
        })
        .expect(200);

      expect(res.body.firstName).toBe('MicroUpdated');
    });

    it('API B3.2: expectedUpdatedAt without an offset is 400, never a TZ-dependent 409', async () => {
      await createDbUser('kai-tz@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-tz@openplany.dev');
      const targetId = await createDbUser('target-tz@openplany.dev', false);
      const loaded = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .expect(200);
      const local = (loaded.body.updatedAt as string).replace(/Z$/, '');

      const res = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ expectedUpdatedAt: local, displayName: 'No Offset' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.fields?.expectedUpdatedAt).toBeDefined();

      const offset = new Date(loaded.body.updatedAt as string);
      const plus7 = new Date(offset.getTime() + 7 * 3_600_000)
        .toISOString()
        .replace('Z', '+07:00');
      await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ expectedUpdatedAt: plus7, displayName: 'With Offset' })
        .expect(200);
    });

    it('returns 409 EMAIL_ALREADY_EXISTS when changing to another user email', async () => {
      await createDbUser('admin-dup@openplany.dev', true);
      const cookie = await signInCookie('admin-dup@openplany.dev');

      await createDbUser('existing-other@openplany.dev', false);
      const targetId = await createDbUser('target-dup@openplany.dev', false);

      const getRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      const res = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: getRes.body.updatedAt,
          email: 'EXISTING-OTHER@openplany.dev',
        })
        .expect(409);

      expect(res.body.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(res.body.fields.email).toBe('A user with this email already exists.');
    });

    it('returns 403 FORBIDDEN when actor loses superuser privileges', async () => {
      const actorId = await createDbUser('actor-demote@openplany.dev', true);
      const cookie = await signInCookie('actor-demote@openplany.dev');

      const targetId = await createDbUser('target-demote@openplany.dev', false);
      const getRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      // Demote actor directly in DB
      await e2e.dataSource.query('UPDATE users SET is_superuser = false WHERE id = $1', [actorId]);

      const res = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: getRes.body.updatedAt,
          firstName: 'ShouldFail',
        })
        .expect(403);

      expect(res.body.code).toBe('FORBIDDEN');
    });

    it('concurrent cross-updates do not deadlock (DB B5)', async () => {
      const admin1Id = await createDbUser('admin-cross1@openplany.dev', true);
      const admin2Id = await createDbUser('admin-cross2@openplany.dev', true);

      const cookie1 = await signInCookie('admin-cross1@openplany.dev');
      const cookie2 = await signInCookie('admin-cross2@openplany.dev');

      const get1 = await http()
        .get(`/api/admin/users/${admin2Id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie1)
        .expect(200);

      const get2 = await http()
        .get(`/api/admin/users/${admin1Id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie2)
        .expect(200);

      // Perform cross-updates concurrently
      const [res1, res2] = await Promise.all([
        http()
          .patch(`/api/admin/users/${admin2Id}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie1)
          .send({
            expectedUpdatedAt: get1.body.updatedAt,
            displayName: 'Admin 2 Updated',
          }),
        http()
          .patch(`/api/admin/users/${admin1Id}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie2)
          .send({
            expectedUpdatedAt: get2.body.updatedAt,
            displayName: 'Admin 1 Updated',
          }),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });

    it('enforces 60 writes per 10 minutes rate limit on PATCH (AC-27)', async () => {
      await createDbUser('rate-write-admin@openplany.dev', true);
      const cookie = await signInCookie('rate-write-admin@openplany.dev');
      const targetId = await createDbUser('target-rate-write@openplany.dev', false);

      const getRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(200);

      // Send 60 requests (no-op updates to target)
      for (let i = 1; i <= 60; i++) {
        await http()
          .patch(`/api/admin/users/${targetId}`)
          .set('Origin', ORIGIN)
          .set('Cookie', cookie)
          .send({
            expectedUpdatedAt: getRes.body.updatedAt,
          })
          .expect(200);
      }

      // 61st request hits rate limit
      const res61 = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          expectedUpdatedAt: getRes.body.updatedAt,
        })
        .expect(429);

      expect(res61.body.code).toBe('TOO_MANY_ATTEMPTS');
      expect(res61.body.message).toBe('Too many changes to users. Try again in 10 minutes.');
      expect(res61.headers['retry-after']).toBeDefined();
      expect(res61.body.retryAfterSeconds).toBeDefined();
    });
  });

  describe('Sign-in & sign-out immutability (RQ INV-08; AC-14)', () => {
    it('sign-in does not change users.updated_at', async () => {
      const email = 'signin-immutable@openplany.dev';
      const userId = await createDbUser(email, false);

      const before = await e2e.dataSource.query<{ updated_at: Date }[]>(
        'SELECT updated_at FROM users WHERE id = $1',
        [userId],
      );

      // Wait 10ms to ensure a time boundary
      await new Promise((resolve) => setTimeout(resolve, 10));

      await http()
        .post('/api/auth/sign-in')
        .set('Origin', ORIGIN)
        .send({ email, password: DEFAULT_PASSWORD })
        .expect(200);

      const after = await e2e.dataSource.query<{ updated_at: Date }[]>(
        'SELECT updated_at FROM users WHERE id = $1',
        [userId],
      );

      expect(after[0]!.updated_at.getTime()).toBe(before[0]!.updated_at.getTime());
    });

    it('sign-in with password rehash does not change users.updated_at', async () => {
      const email = 'rehash-immutable@openplany.dev';
      // Legacy Django PBKDF2 hash
      const djangoHash =
        'pbkdf2_sha256$260000$seasalt$YlZ2Vggtqdc61YjArZuoApoBh9JNGYoDRBUGu6tcJQo=';
      const userId = await createDbUser(email, false, djangoHash);

      const before = await e2e.dataSource.query<{ updated_at: Date; password: string }[]>(
        'SELECT updated_at, password FROM users WHERE id = $1',
        [userId],
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      await http()
        .post('/api/auth/sign-in')
        .set('Origin', ORIGIN)
        .send({ email, password: 'lètmein' })
        .expect(200);

      const after = await e2e.dataSource.query<{ updated_at: Date; password: string }[]>(
        'SELECT updated_at, password FROM users WHERE id = $1',
        [userId],
      );

      // Password was rehashed to argon2id
      expect(after[0]!.password).toMatch(/^\$argon2id\$/);
      expect(after[0]!.password).not.toBe(before[0]!.password);
      // updated_at was NOT modified!
      expect(after[0]!.updated_at.getTime()).toBe(before[0]!.updated_at.getTime());
    });

    it('sign-out does not change users.updated_at', async () => {
      const email = 'signout-immutable@openplany.dev';
      const userId = await createDbUser(email, false);
      const cookie = await signInCookie(email);

      const before = await e2e.dataSource.query<{ updated_at: Date }[]>(
        'SELECT updated_at FROM users WHERE id = $1',
        [userId],
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      await http()
        .post('/api/auth/sign-out')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .expect(204);

      const after = await e2e.dataSource.query<{ updated_at: Date }[]>(
        'SELECT updated_at FROM users WHERE id = $1',
        [userId],
      );

      expect(after[0]!.updated_at.getTime()).toBe(before[0]!.updated_at.getTime());
    });
  });

  describe('PUT /api/admin/users/:userId/password (Ticket 06)', () => {
    it('AC-17 & AC-25: changes password, revokes all active sessions, allows new login, keeps actor session, logs without PII', async () => {
      const kaiId = await createDbUser('kai@openplany.dev', true);
      const kaiCookie = await signInCookie('kai@openplany.dev');

      const namId = await createDbUser('nam@openplany.dev', false);
      const namCookie1 = await signInCookie('nam@openplany.dev');
      const namCookie2 = await signInCookie('nam@openplany.dev');
      const namCookie3 = await signInCookie('nam@openplany.dev');

      // Verify all 3 sessions are active
      await http().get('/api/users/me').set('Cookie', namCookie1).set('Origin', ORIGIN).expect(200);
      await http().get('/api/users/me').set('Cookie', namCookie2).set('Origin', ORIGIN).expect(200);
      await http().get('/api/users/me').set('Cookie', namCookie3).set('Origin', ORIGIN).expect(200);

      const loggedMessages: string[] = [];
      const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation((msg: string) => {
        loggedMessages.push(String(msg));
      });

      try {
        const newPassword = 'NewSecretPassword456!';
        await http()
          .put(`/api/admin/users/${namId}/password`)
          .set('Origin', ORIGIN)
          .set('Cookie', kaiCookie)
          .send({ password: newPassword })
          .expect(204);

        // Nam's 3 sessions are now revoked -> 401
        await http().get('/api/users/me').set('Cookie', namCookie1).set('Origin', ORIGIN).expect(401);
        await http().get('/api/users/me').set('Cookie', namCookie2).set('Origin', ORIGIN).expect(401);
        await http().get('/api/users/me').set('Cookie', namCookie3).set('Origin', ORIGIN).expect(401);

        // Kai's session is still active
        await http().get('/api/users/me').set('Cookie', kaiCookie).set('Origin', ORIGIN).expect(200);

        // Nam cannot sign in with old password
        await http()
          .post('/api/auth/sign-in')
          .set('Origin', ORIGIN)
          .send({ email: 'nam@openplany.dev', password: DEFAULT_PASSWORD })
          .expect(401);

        // Nam can sign in with new password
        const newNamCookie = await signInCookie('nam@openplany.dev', newPassword);
        await http().get('/api/users/me').set('Cookie', newNamCookie).set('Origin', ORIGIN).expect(200);

        // Verify logs: contains user.password_changed with revokedSessionCount=3, actorId, userId, NO PII
        const pwdLogs = loggedMessages.filter((m) => m.startsWith('user.password_changed'));
        expect(pwdLogs).toHaveLength(1);
        expect(pwdLogs[0]).toContain(`userId=${namId}`);
        expect(pwdLogs[0]).toContain(`actorId=${kaiId}`);
        expect(pwdLogs[0]).toContain('revokedSessionCount=3');
        expect(pwdLogs[0]).toContain('requestId=');
        for (const logMsg of loggedMessages) {
          expect(logMsg).not.toContain(newPassword);
          expect(logMsg).not.toContain('nam@openplany.dev');
        }
      } finally {
        logSpy.mockRestore();
      }
    });

    it('AC-18: actor cannot change own password -> 403 CANNOT_CHANGE_OWN_PASSWORD', async () => {
      const kaiId = await createDbUser('kai-self@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-self@openplany.dev');

      const res = await http()
        .put(`/api/admin/users/${kaiId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'SomeOtherPassword123!' })
        .expect(403);

      expect(res.body.code).toBe('CANNOT_CHANGE_OWN_PASSWORD');
      expect(res.body.message).toBe("You can't change your own password here.");
    });

    it('AC-19: password equals target email (case-insensitive) -> 400 fields.password', async () => {
      await createDbUser('kai-pw@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-pw@openplany.dev');
      const namId = await createDbUser('nam-pw@openplany.dev', false);

      // Exact match
      const res1 = await http()
        .put(`/api/admin/users/${namId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'nam-pw@openplany.dev' })
        .expect(400);

      expect(res1.body.code).toBe('VALIDATION_ERROR');
      expect(res1.body.fields?.password).toBe("Password can't be the same as the email");

      // Case variation
      const res2 = await http()
        .put(`/api/admin/users/${namId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'NAM-PW@OPENPLANY.DEV' })
        .expect(400);

      expect(res2.body.code).toBe('VALIDATION_ERROR');
      expect(res2.body.fields?.password).toBe("Password can't be the same as the email");
    });

    it('AC-20: deactivated target user password can still be changed -> 204', async () => {
      await createDbUser('kai-deact@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-deact@openplany.dev');
      const targetId = await createDbUser('inactive@openplany.dev', false);

      // Deactivate user in DB
      await e2e.dataSource.query('UPDATE users SET is_active = false WHERE id = $1', [targetId]);

      await http()
        .put(`/api/admin/users/${targetId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'NewPasswordForInactive123!' })
        .expect(204);
    });

    it('AC-21: password change updates updated_at so open edit modal gets 409', async () => {
      await createDbUser('kai-concur@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-concur@openplany.dev');
      const targetId = await createDbUser('target-concur@openplany.dev', false);

      // Kai fetches target details
      const detailRes = await http()
        .get(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .expect(200);

      const staleUpdatedAt = detailRes.body.updatedAt;

      // Kai changes password in another tab
      await http()
        .put(`/api/admin/users/${targetId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'ChangedPassword999!' })
        .expect(204);

      // Kai tries to save edit using stale expectedUpdatedAt
      const editRes = await http()
        .patch(`/api/admin/users/${targetId}`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({
          expectedUpdatedAt: staleUpdatedAt,
          firstName: 'NewFirstName',
          lastName: 'NewLastName',
          displayName: 'New Display Name',
          email: 'target-concur@openplany.dev',
        })
        .expect(409);

      expect(editRes.body.code).toBe('USER_CHANGED_SINCE_LOADED');
    });

    it('AC-26 & API B3.3 / B5: input validation and error codes', async () => {
      await createDbUser('kai-val@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-val@openplany.dev');
      const targetId = await createDbUser('target-val@openplany.dev', false);

      // Invalid UUID
      const badUuid = await http()
        .put('/api/admin/users/not-a-uuid/password')
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'ValidPassword123!' })
        .expect(400);
      expect(badUuid.body.code).toBe('VALIDATION_ERROR');
      expect(badUuid.body.fields?.userId).toBeDefined();

      // Unknown user
      const unknownId = '00000000-0000-4000-8000-000000000000';
      const notFound = await http()
        .put(`/api/admin/users/${unknownId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'ValidPassword123!' })
        .expect(404);
      expect(notFound.body.code).toBe('USER_NOT_FOUND');

      // Password < 8 chars
      const shortPw = await http()
        .put(`/api/admin/users/${targetId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: '1234567' })
        .expect(400);
      expect(shortPw.body.code).toBe('VALIDATION_ERROR');
      expect(shortPw.body.fields?.password).toBe('Use 8 to 128 characters');

      // Extra unwhitelisted properties
      const extraProp = await http()
        .put(`/api/admin/users/${targetId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: 'ValidPassword123!', confirmPassword: 'ValidPassword123!' })
        .expect(400);
      expect(extraProp.body.code).toBe('VALIDATION_ERROR');
    });

    it('API B7: another instance admin\'s password needs the actor\'s own password (step-up)', async () => {
      await createDbUser('kai-step@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-step@openplany.dev');
      const binhId = await createDbUser('binh-step@openplany.dev', true);
      const binhCookie = await signInCookie('binh-step@openplany.dev');
      const put = (body: Record<string, unknown>, lang = 'en') =>
        http()
          .put(`/api/admin/users/${binhId}/password`)
          .set('Origin', ORIGIN)
          .set('Cookie', kaiCookie)
          .set('Accept-Language', lang)
          .send(body);

      const required = await put({ password: 'NewSecret456!' }).expect(403);
      expect(required.body.code).toBe('REAUTHENTICATION_REQUIRED');
      expect(required.body.fields?.actorPassword).toBe(
        "Enter your password to change another instance admin's password.",
      );

      const wrong = await put({ password: 'NewSecret456!', actorPassword: 'nope' }, 'vi').expect(403);
      expect(wrong.body.code).toBe('REAUTHENTICATION_FAILED');
      expect(wrong.body.fields?.actorPassword).toBe('Mật khẩu của bạn không đúng.');

      // Nothing changed so far: Bình's session is still live.
      await http().get('/api/users/me').set('Cookie', binhCookie).set('Origin', ORIGIN).expect(200);

      await put({ password: 'NewSecret456!', actorPassword: DEFAULT_PASSWORD }).expect(204);
      await http().get('/api/users/me').set('Cookie', binhCookie).set('Origin', ORIGIN).expect(401);
      await signInCookie('binh-step@openplany.dev', 'NewSecret456!');
    });

    it('API B7: wrong actor passwords are limited to 5 per 15 minutes per actor (429)', async () => {
      await createDbUser('kai-guess@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-guess@openplany.dev');
      const binhId = await createDbUser('binh-guess@openplany.dev', true);
      const put = (actorPassword: string) =>
        http()
          .put(`/api/admin/users/${binhId}/password`)
          .set('Origin', ORIGIN)
          .set('Cookie', kaiCookie)
          .send({ password: 'NewSecret456!', actorPassword });

      for (let i = 0; i < 5; i++) {
        const res = await put(`guess-${i}`).expect(403);
        expect(res.body.code).toBe('REAUTHENTICATION_FAILED');
      }
      // Even the right password is refused while blocked: no oracle.
      const blocked = await put(DEFAULT_PASSWORD).expect(429);
      expect(blocked.body.code).toBe('TOO_MANY_REAUTH_ATTEMPTS');
      expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
      expect(blocked.body.message).toMatch(/^Too many incorrect passwords\. Try again in \d+ minutes?\.$/);
    });

    it('AC-32: 8 concurrent requests with wrong actorPassword -> at most 5 verified, rest 429 TOO_MANY_REAUTH_ATTEMPTS', async () => {
      await createDbUser('kai-parallel@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-parallel@openplany.dev');
      const binhId = await createDbUser('binh-parallel@openplany.dev', true);
      const put = (actorPassword: string) =>
        http()
          .put(`/api/admin/users/${binhId}/password`)
          .set('Origin', ORIGIN)
          .set('Cookie', kaiCookie)
          .send({ password: 'NewSecret456!', actorPassword });

      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) => put(`wrong-parallel-${i}`)),
      );

      const forbidden = responses.filter((r) => r.status === 403);
      const tooMany = responses.filter((r) => r.status === 429);

      expect(forbidden.length).toBeLessThanOrEqual(5);
      expect(forbidden.length + tooMany.length).toBe(8);
      expect(tooMany.length).toBeGreaterThanOrEqual(3);
      for (const res of forbidden) {
        expect(res.body.code).toBe('REAUTHENTICATION_FAILED');
      }
      for (const res of tooMany) {
        expect(res.body.code).toBe('TOO_MANY_REAUTH_ATTEMPTS');
      }
    });

    it('DB B7: one lock order (users → sessions), so touch and logout never deadlock with a password change', async () => {
      const namId = await createDbUser('nam-lock@openplany.dev', false);
      const namCookie = await signInCookie('nam-lock@openplany.dev');
      const tokenCookie = await signInCookie('nam-lock@openplany.dev');
      const sessions = await e2e.dataSource.getRepository(Session).find({
        where: { userId: namId },
        order: { createdAt: 'ASC' },
      });
      expect(sessions).toHaveLength(2);
      const repo = e2e.app.get(SessionsRepository);
      const now = new Date();

      // The admin password change: lock the users row, then revoke sessions.
      const qr = e2e.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        await qr.manager.find(User, {
          where: { id: namId },
          lock: { mode: 'pessimistic_write' },
        });
        // Nam's own requests meanwhile: a sliding-expiry touch and a logout.
        const touch = repo.touch(sessions[0]!, now, new Date(now.getTime() + 60_000));
        const logout = http()
          .post('/api/auth/sign-out')
          .set('Origin', ORIGIN)
          .set('Cookie', tokenCookie);
        const logoutDone = logout.then((res) => res.status);
        await waitForLockWaiters(2);
        // Under the old order (sessions → users) this UPDATE closed a cycle: 40P01.
        await qr.manager.update(
          Session,
          { userId: namId, revokedAt: IsNull() },
          { revokedAt: now },
        );
        await qr.commitTransaction();
        await touch;
        expect(await logoutDone).toBe(204);
      } finally {
        if (qr.isTransactionActive) await qr.rollbackTransaction();
        await qr.release();
      }
      await http().get('/api/users/me').set('Cookie', namCookie).set('Origin', ORIGIN).expect(401);
    });

    it('AC-33: sign-in with stale credentials throws 401 when password changed between verify and write', async () => {
      const email = 'stale-signin@openplany.dev';
      const userId = await createDbUser(email, false);

      const hasher = e2e.app.get(PasswordHasher);
      const originalVerify = hasher.verify.bind(hasher);
      const verifySpy = vi.spyOn(hasher, 'verify').mockImplementation(async (hash, candidate) => {
        const result = await originalVerify(hash, candidate);
        if (result && candidate === DEFAULT_PASSWORD) {
          // Admin changes user's password in DB concurrently
          const newHash = await new Argon2PasswordHasher().hash('NewConcurrentlyChanged123!');
          await e2e.dataSource.query('UPDATE users SET password = $1 WHERE id = $2', [
            newHash,
            userId,
          ]);
        }
        return result;
      });

      try {
        const res = await http()
          .post('/api/auth/sign-in')
          .set('Origin', ORIGIN)
          .send({ email, password: DEFAULT_PASSWORD })
          .expect(401);

        expect(res.body.code).toBe('INVALID_CREDENTIALS');

        // No session was created
        const sessionCount = await e2e.dataSource.query<{ count: string }[]>(
          'SELECT count(*) FROM sessions WHERE user_id = $1',
          [userId],
        );
        expect(sessionCount[0]!.count).toBe('0');

        // Failed login attempt was recorded with wrong_password
        const attempts = await e2e.dataSource.query<
          { result: string; reason: string }[]
        >(
          'SELECT result, reason FROM login_attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
          [userId],
        );
        expect(attempts).toHaveLength(1);
        expect(attempts[0]!.result).toBe('failure');
        expect(attempts[0]!.reason).toBe('wrong_password');
      } finally {
        verifySpy.mockRestore();
      }
    });

    it('AC-34: clears isPasswordAutoset, isPasswordResetRequired, isPasswordExpired so user can sign in normally', async () => {
      await createDbUser('kai-flags@openplany.dev', true);
      const kaiCookie = await signInCookie('kai-flags@openplany.dev');

      const targetEmail = 'flags-target@openplany.dev';
      const targetId = await createDbUser(targetEmail, false);

      // Set all 3 flags to true
      await e2e.dataSource.query(
        `UPDATE users
         SET is_password_autoset = true,
             is_password_reset_required = true,
             is_password_expired = true
         WHERE id = $1`,
        [targetId],
      );

      const newPassword = 'CleanFlagsPassword123!';
      await http()
        .put(`/api/admin/users/${targetId}/password`)
        .set('Origin', ORIGIN)
        .set('Cookie', kaiCookie)
        .send({ password: newPassword })
        .expect(204);

      // Verify all 3 flags are false in DB
      const userRow = await e2e.dataSource.query<
        {
          is_password_autoset: boolean;
          is_password_reset_required: boolean;
          is_password_expired: boolean;
        }[]
      >(
        'SELECT is_password_autoset, is_password_reset_required, is_password_expired FROM users WHERE id = $1',
        [targetId],
      );
      expect(userRow[0]!.is_password_autoset).toBe(false);
      expect(userRow[0]!.is_password_reset_required).toBe(false);
      expect(userRow[0]!.is_password_expired).toBe(false);

      // User signs in with new password -> 200 (not restricted with PASSWORD_RESET_REQUIRED)
      const targetCookie = await signInCookie(targetEmail, newPassword);
      await http().get('/api/users/me').set('Cookie', targetCookie).set('Origin', ORIGIN).expect(200);
    });
  });
});
