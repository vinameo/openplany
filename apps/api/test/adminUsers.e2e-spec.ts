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
});
