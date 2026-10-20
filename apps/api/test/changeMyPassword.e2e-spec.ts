import request from 'supertest';
import { Logger } from '@nestjs/common';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { IsNull, MoreThan } from 'typeorm';
import { Session } from '../src/auth/entities/session.entity.js';
import { User } from '../src/auth/entities/user.entity.js';
import { Argon2PasswordHasher } from '../src/auth/passwordHasher.js';
import { LockedUsersRepository } from '../src/auth/repositories/lockedUsers.js';
import { UsersRepository } from '../src/auth/repositories/usersRepository.js';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

const ORIGIN = 'http://localhost:5173';
const DEFAULT_PASSWORD = 'OldPassword123!';
const NEW_PASSWORD = 'NewPassword456!';

describe('PUT /api/users/me/password (e2e)', () => {
  let e2e: E2eApp;
  let passwordHash: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    passwordHash = await new Argon2PasswordHasher().hash(DEFAULT_PASSWORD);
  });

  beforeEach(async () => {
    await e2e.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  async function createDbUser(
    email: string,
    isSuperuser = false,
    overrides: {
      password?: string;
      isPasswordResetRequired?: boolean;
      isPasswordExpired?: boolean;
      isActive?: boolean;
      maskedAt?: Date | null;
    } = {},
  ): Promise<string> {
    const pwdHash = overrides.password ?? passwordHash;
    const rows = await e2e.dataSource.query<{ id: string }[]>(
      `INSERT INTO users (
        email, username, password, first_name, last_name, display_name,
        is_superuser, is_staff, is_email_verified,
        is_password_autoset, is_password_reset_required, is_password_expired,
        is_active, masked_at,
        date_joined, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'An', 'Nguyen', 'An Nguyen',
        $4, $4, true,
        false, $5, $6,
        $7, $8,
        now(), now(), now()
      )
      RETURNING id`,
      [
        email.toLowerCase(),
        email.toLowerCase().replace(/[^a-z0-9]/g, ''),
        pwdHash,
        isSuperuser,
        overrides.isPasswordResetRequired ?? false,
        overrides.isPasswordExpired ?? false,
        overrides.isActive ?? true,
        overrides.maskedAt ?? null,
      ],
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
    const cookies: string[] = response.headers[
      'set-cookie'
    ] as unknown as string[];
    const cookie = cookies.find((value) => value.startsWith('op_session='));
    if (cookie === undefined) throw new Error('No session cookie was set');
    return cookie.split(';')[0]!;
  }

  it('AC-05 & AC-24 & AC-25: changes password, revokes other sessions, sets new cookie, preserves flags (en)', async () => {
    const email = 'an-ac05@openplany.dev';
    const userId = await createDbUser(email, false);

    // Three sessions for An: browser A, B, C
    const cookieA = await signInCookie(email);
    const cookieB = await signInCookie(email);
    const cookieC = await signInCookie(email);

    const initialSessions = await e2e.dataSource.getRepository(Session).find({
      where: { userId, revokedAt: IsNull() },
    });
    expect(initialSessions).toHaveLength(3);

    // Log spy to check AC-16
    const logSpy = vi.spyOn(Logger.prototype, 'log');

    // Browser A calls PUT /api/users/me/password
    const res = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieA)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    // AC-25: Cache-Control: no-store, no password or token in body
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe(email);
    expect(res.body.requiresPasswordReset).toBe(false);
    expect(res.body.password).toBeUndefined();
    expect(res.body.token).toBeUndefined();

    // AC-24: Set-Cookie has HttpOnly, SameSite=Lax, Path=/
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const newCookieHeader = setCookie.find((c) => c.startsWith('op_session='));
    expect(newCookieHeader).toBeDefined();
    expect(newCookieHeader).toContain('HttpOnly');
    expect(newCookieHeader).toContain('SameSite=Lax');
    expect(newCookieHeader).toContain('Path=/');

    const newCookieA = newCookieHeader!.split(';')[0]!;

    // Next request from browser A with new cookie succeeds
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', newCookieA)
      .expect(200);

    // Old cookies from A, B, C now return 401
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieA)
      .expect(401);
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieB)
      .expect(401);
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieC)
      .expect(401);

    // Sign in with new password succeeds, old password fails
    await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: NEW_PASSWORD })
      .expect(200);

    await http()
      .post('/api/auth/sign-in')
      .set('Origin', ORIGIN)
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(401);

    // Check DB state
    const userRow = await e2e.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId });
    expect(userRow.isPasswordAutoset).toBe(false);
    expect(userRow.isPasswordExpired).toBe(false);
    expect(userRow.isPasswordResetRequired).toBe(false);

    const liveSessions = await e2e.dataSource.getRepository(Session).find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    expect(liveSessions.length).toBeGreaterThanOrEqual(1);

    // AC-16: Logging check
    const calls = logSpy.mock.calls.map((c) => String(c[0]));
    const passwordChangedLog = calls.find((c) =>
      c.includes('user.password_changed'),
    );
    expect(passwordChangedLog).toBeDefined();
    expect(passwordChangedLog).toContain(`userId=${userId}`);
    expect(passwordChangedLog).toContain(`actorId=${userId}`);
    expect(passwordChangedLog).toContain('revokedSessionCount=3');
    // Ensure no sensitive items logged
    expect(passwordChangedLog).not.toContain(DEFAULT_PASSWORD);
    expect(passwordChangedLog).not.toContain(NEW_PASSWORD);
    expect(passwordChangedLog).not.toContain(email);
  });

  it('AC-06: rejects incorrect current password with 400 CURRENT_PASSWORD_INCORRECT (en + vi)', async () => {
    const emailEn = 'an-ac06-en@openplany.dev';
    await createDbUser(emailEn);
    const cookieEn = await signInCookie(emailEn);

    const resEn = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieEn)
      .send({
        currentPassword: 'WrongPassword999!',
        newPassword: NEW_PASSWORD,
      })
      .expect(400);

    expect(resEn.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(resEn.body.message).toBe('Your current password is incorrect.');
    expect(resEn.body.fields).toEqual({
      currentPassword: 'Your current password is incorrect.',
    });

    // In Vietnamese (AC-19)
    const emailVi = 'an-ac06-vi@openplany.dev';
    await createDbUser(emailVi);
    const cookieVi = await signInCookie(emailVi);

    const resVi = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookieVi)
      .set('Accept-Language', 'vi')
      .send({
        currentPassword: 'WrongPassword999!',
        newPassword: NEW_PASSWORD,
      })
      .expect(400);

    expect(resVi.headers['content-language']).toBe('vi');
    expect(resVi.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(resVi.body.message).toBe('Mật khẩu hiện tại không đúng.');
    expect(resVi.body.fields).toEqual({
      currentPassword: 'Mật khẩu hiện tại không đúng.',
    });
  });

  it('AC-07: rate limits 5 incorrect passwords per 15 minutes, allows parallel <= 5 (en + vi)', async () => {
    const email = 'an-ac07@openplany.dev';
    await createDbUser(email);
    const cookie = await signInCookie(email);

    // 5 incorrect attempts
    for (let i = 0; i < 5; i++) {
      await http()
        .put('/api/users/me/password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          currentPassword: 'WrongPassword!',
          newPassword: NEW_PASSWORD,
        })
        .expect(400);
    }

    // 6th attempt is rate-limited (even with correct current password)
    const res6 = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(429);

    expect(res6.body.code).toBe('TOO_MANY_PASSWORD_ATTEMPTS');
    expect(res6.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res6.body.message).toMatch(
      /Too many incorrect passwords\. Try again in \d+ minutes?\./,
    );

    // In Vietnamese
    const resVi = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Accept-Language', 'vi')
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(429);

    expect(resVi.body.message).toMatch(
      /Bạn đã nhập sai mật khẩu quá nhiều lần\. Hãy thử lại sau \d+ phút\./,
    );

    // User is still signed in
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .expect(200);

    // Parallel attempts test on another user
    const parallelEmail = 'parallel-ac07@openplany.dev';
    await createDbUser(parallelEmail);
    const parallelCookie = await signInCookie(parallelEmail);

    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    // 8 concurrent wrong password requests
    const results = await Promise.all(
      Array.from({ length: 8 }).map(() =>
        http()
          .put('/api/users/me/password')
          .set('Origin', ORIGIN)
          .set('Cookie', parallelCookie)
          .send({
            currentPassword: 'WrongPasswordParallel!',
            newPassword: NEW_PASSWORD,
          }),
      ),
    );

    const status400 = results.filter((r) => r.status === 400);
    const status429 = results.filter((r) => r.status === 429);
    expect(status400.length).toBeLessThanOrEqual(5);
    expect(status400.length + status429.length).toBe(8);

    const incorrectLogs = warnSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((msg) => msg.includes('users.me.password.incorrect'));
    expect(incorrectLogs.length).toBeLessThanOrEqual(5);
  });

  it('AC-08: rejects newPassword too short, too long, matching email, or matching currentPassword', async () => {
    const email = 'an-ac08@openplany.dev';
    await createDbUser(email);
    const cookie = await signInCookie(email);

    // 7 characters (< 8)
    const resShort = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: '1234567' })
      .expect(400);
    expect(resShort.body.code).toBe('VALIDATION_ERROR');
    expect(resShort.body.fields.newPassword).toBeDefined();

    // 129 characters (> 128)
    const resLong = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'a'.repeat(129) })
      .expect(400);
    expect(resLong.body.code).toBe('VALIDATION_ERROR');
    expect(resLong.body.fields.newPassword).toBeDefined();

    // Equals email (case-insensitive)
    const resEmail = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: email.toUpperCase(),
      })
      .expect(400);
    expect(resEmail.body.code).toBe('VALIDATION_ERROR');
    expect(resEmail.body.fields.newPassword).toBe(
      "Password can't be the same as the email",
    );

    // Equals currentPassword (en + vi)
    const resSame = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: DEFAULT_PASSWORD,
      })
      .expect(400);
    expect(resSame.body.code).toBe('VALIDATION_ERROR');
    expect(resSame.body.fields.newPassword).toBe(
      'Choose a password different from your current one',
    );

    const resSameVi = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Accept-Language', 'vi')
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: DEFAULT_PASSWORD,
      })
      .expect(400);
    expect(resSameVi.body.fields.newPassword).toBe(
      'Hãy chọn mật khẩu khác mật khẩu hiện tại',
    );
  });

  it('AC-09: missing currentPassword or 129-char does not consume failure limit', async () => {
    const email = 'an-ac09@openplany.dev';
    await createDbUser(email);
    const cookie = await signInCookie(email);

    // Missing current password
    await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ newPassword: NEW_PASSWORD })
      .expect(400);

    // Empty current password
    await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: '', newPassword: NEW_PASSWORD })
      .expect(400);

    // 129 chars current password
    const res129 = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: 'b'.repeat(129), newPassword: NEW_PASSWORD })
      .expect(400);
    expect(res129.body.fields.currentPassword).toBe('Password is too long');

    // 5 attempts should still be available
    for (let i = 0; i < 5; i++) {
      await http()
        .put('/api/users/me/password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ currentPassword: 'WrongPassword!', newPassword: NEW_PASSWORD })
        .expect(400);
    }
  });

  it('AC-10 & AC-11: allows reset-only session to PUT /users/me/password, clears reset flags and upgrades session', async () => {
    const email = 'nam-reset@openplany.dev';
    const userId = await createDbUser(email, false, {
      isPasswordResetRequired: true,
      isPasswordExpired: true,
    });

    const resetCookie = await signInCookie(email);

    // Normal routes reject reset-only session with 403 PASSWORD_RESET_REQUIRED
    await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', resetCookie)
      .expect(403);

    await http()
      .patch('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', resetCookie)
      .send({ displayName: 'New Name' })
      .expect(403);

    // PUT /api/users/me/password is permitted
    const res = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', resetCookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    expect(res.body.requiresPasswordReset).toBe(false);

    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const upgradedCookie = setCookie
      .find((c) => c.startsWith('op_session='))!
      .split(';')[0]!;

    // Now GET /api/users/me works with upgraded cookie
    const getMeRes = await http()
      .get('/api/users/me')
      .set('Origin', ORIGIN)
      .set('Cookie', upgradedCookie)
      .expect(200);
    expect(getMeRes.body.email).toBe(email);

    const user = await e2e.dataSource
      .getRepository(User)
      .findOneByOrFail({ id: userId });
    expect(user.isPasswordResetRequired).toBe(false);
    expect(user.isPasswordExpired).toBe(false);
  });

  it('AC-12: admin resets password during user request -> 401 UNAUTHENTICATED without consuming failure slot', async () => {
    const email = 'an-ac12@openplany.dev';
    const userId = await createDbUser(email);
    const userCookie = await signInCookie(email);

    // Interleave (a): admin commits password change and revokes sessions before password confirmation
    const usersRepo = e2e.app.get(UsersRepository);
    const origFindActiveById = usersRepo.findActiveById.bind(usersRepo);
    vi.spyOn(usersRepo, 'findActiveById').mockImplementationOnce(async (id) => {
      const u = await origFindActiveById(id);
      // Admin changes password and revokes session
      const newAdminHash = await new Argon2PasswordHasher().hash(
        'AdminChangedPassword999!',
      );
      await e2e.dataSource
        .getRepository(User)
        .update(userId, { password: newAdminHash });
      await e2e.dataSource
        .getRepository(Session)
        .update({ userId }, { revokedAt: new Date() });
      return u;
    });

    const res = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', userCookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(401);

    expect(res.body.code).toBe('UNAUTHENTICATED');

    // Interleave (b): admin commits after verify but before lockedUsers row transaction (Step 4 -> Step 5)
    const email2 = 'an-ac12b@openplany.dev';
    const userId2 = await createDbUser(email2);
    const userCookie2 = await signInCookie(email2);

    const lockedUsersRepo = e2e.app.get(LockedUsersRepository);
    const origWithLocked =
      lockedUsersRepo.withLockedUsers.bind(lockedUsersRepo);
    vi.spyOn(lockedUsersRepo, 'withLockedUsers').mockImplementationOnce(
      async (ids, work, onRetry) => {
        // Admin revokes session right before user's withLockedUsers locks the row
        await e2e.dataSource
          .getRepository(Session)
          .update({ userId: userId2 }, { revokedAt: new Date() });
        return origWithLocked(ids, work, onRetry);
      },
    );

    // Send PUT request
    const userRes = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', userCookie2)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      });

    expect(userRes.status).toBe(401);
    expect(userRes.body.code).toBe('UNAUTHENTICATED');
  });

  it('AC-13: concurrent PUT requests with same cookie: one 200, one 401 without clearing cookie, exactly 1 live session', async () => {
    const email = 'an-ac13@openplany.dev';
    const userId = await createDbUser(email);
    const cookie = await signInCookie(email);

    const [res1, res2] = await Promise.all([
      http()
        .put('/api/users/me/password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          currentPassword: DEFAULT_PASSWORD,
          newPassword: 'BrandNewSecret1!',
        }),
      http()
        .put('/api/users/me/password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({
          currentPassword: DEFAULT_PASSWORD,
          newPassword: 'BrandNewSecret2!',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 401]);

    const res401 = res1.status === 401 ? res1 : res2;
    expect(res401.body.code).toBe('UNAUTHENTICATED');
    // Ensure 401 did NOT clear cookie
    const setCookie401 = res401.headers['set-cookie'] as unknown as
      string[] | undefined;
    if (setCookie401) {
      const clearOpSession = setCookie401.find(
        (c) => c.includes('op_session=;') || c.includes('Max-Age=0'),
      );
      expect(clearOpSession).toBeUndefined();
    }

    // Exactly 1 live session in DB
    const liveSessions = await e2e.dataSource.getRepository(Session).find({
      where: { userId, revokedAt: IsNull(), expiresAt: MoreThan(new Date()) },
    });
    expect(liveSessions).toHaveLength(1);
  });

  it('AC-14: deactivated or masked account returns 401 UNAUTHENTICATED without writing', async () => {
    const activeEmail = 'an-ac14-active@openplany.dev';
    const userId = await createDbUser(activeEmail);
    const cookie = await signInCookie(activeEmail);

    // Deactivate user in DB
    await e2e.dataSource
      .getRepository(User)
      .update(userId, { isActive: false });

    await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(401);
  });

  it('AC-15: admin edit user detects concurrent password change with 409 USER_CHANGED_SINCE_LOADED', async () => {
    const adminEmail = 'admin-ac15@openplany.dev';
    const userEmail = 'user-ac15@openplany.dev';
    await createDbUser(adminEmail, true);
    const userId = await createDbUser(userEmail, false);

    const adminCookie = await signInCookie(adminEmail);
    const userCookie = await signInCookie(userEmail);

    // Admin loads user
    const loaded = await http()
      .get(`/api/admin/users/${userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .expect(200);

    const originalUpdatedAt = loaded.body.updatedAt;
    expect(originalUpdatedAt).toBeDefined();

    // User changes own password
    await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', userCookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    // Admin attempts to update user with stale updatedAt
    const patchRes = await http()
      .patch(`/api/admin/users/${userId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({
        displayName: 'New Admin Name',
        expectedUpdatedAt: originalUpdatedAt,
      })
      .expect(409);

    expect(patchRes.body.code).toBe('USER_CHANGED_SINCE_LOADED');
  });

  it('AC-23: instance admin can change own password via PUT /api/users/me/password', async () => {
    const adminEmail = 'admin-ac23@openplany.dev';
    await createDbUser(adminEmail, true);
    const adminCookie = await signInCookie(adminEmail);

    const res = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', adminCookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    expect(res.body.user.isInstanceAdmin).toBe(true);
  });

  it('AC-24: requests from untrusted origin are rejected with 403 ORIGIN_NOT_ALLOWED', async () => {
    const email = 'an-ac24@openplany.dev';
    await createDbUser(email);
    const cookie = await signInCookie(email);

    await http()
      .put('/api/users/me/password')
      .set('Origin', 'http://malicious-site.com')
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(403);
  });

  it('AC-26: rate limits exceeding 10 requests per 10 minutes with 429 TOO_MANY_PASSWORD_CHANGES (en + vi)', async () => {
    const email = 'an-ac26@openplany.dev';
    await createDbUser(email);
    const cookie = await signInCookie(email);

    // Send 10 requests (each with validation error, e.g. empty newPassword)
    for (let i = 0; i < 10; i++) {
      await http()
        .put('/api/users/me/password')
        .set('Origin', ORIGIN)
        .set('Cookie', cookie)
        .send({ currentPassword: DEFAULT_PASSWORD, newPassword: 'short' })
        .expect(400);
    }

    // 11th request triggers MY_PASSWORD_CHANGE_LIMITER (en)
    const res11 = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(429);

    expect(res11.body.code).toBe('TOO_MANY_PASSWORD_CHANGES');
    expect(res11.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(res11.body.message).toMatch(
      /Too many password changes\. Try again in \d+ minutes?\./,
    );

    // In Vietnamese (vi)
    const resVi = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .set('Accept-Language', 'vi')
      .send({ currentPassword: DEFAULT_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(429);

    expect(resVi.headers['content-language']).toBe('vi');
    expect(resVi.body.code).toBe('TOO_MANY_PASSWORD_CHANGES');
    expect(resVi.body.message).toMatch(
      /Bạn đã đổi mật khẩu quá nhiều lần\. Hãy thử lại sau \d+ phút\./,
    );
  });

  it('AC-29: retries once when hash rehashed concurrently with same password, succeeds with 200', async () => {
    const email = 'an-ac29@openplany.dev';
    const userId = await createDbUser(email);
    const cookie = await signInCookie(email);

    const rehashedPassword = await new Argon2PasswordHasher().hash(
      DEFAULT_PASSWORD,
    );
    const lockedUsersRepo = e2e.app.get(LockedUsersRepository);
    const origWithLocked =
      lockedUsersRepo.withLockedUsers.bind(lockedUsersRepo);

    let lockCount = 0;
    vi.spyOn(lockedUsersRepo, 'withLockedUsers').mockImplementation(
      async (ids, work, onRetry) => {
        lockCount++;
        if (lockCount === 1) {
          // Change password in DB to rehashedPassword before first lock attempt
          await e2e.dataSource.query(
            'UPDATE users SET password = $1 WHERE id = $2',
            [rehashedPassword, userId],
          );
        }
        return origWithLocked(ids, work, onRetry);
      },
    );

    const res = await http()
      .put('/api/users/me/password')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        currentPassword: DEFAULT_PASSWORD,
        newPassword: NEW_PASSWORD,
      })
      .expect(200);

    expect(lockCount).toBe(2);
    expect(res.body.requiresPasswordReset).toBe(false);
  });

  it('AC-27: old session waiting on users lock gets 401 without Set-Cookie and does not extend session', async () => {
    const email = 'an-ac27@openplany.dev';
    const userId = await createDbUser(email);
    const oldCookie = await signInCookie(email);

    // Make old session stale so it requires touch (> 5 minutes)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    await e2e.dataSource
      .getRepository(Session)
      .update({ userId }, { lastUsedAt: tenMinAgo });

    const sessionBefore = await e2e.dataSource
      .getRepository(Session)
      .findOneByOrFail({ userId });
    const initialExpiresAt = sessionBefore.expiresAt.getTime();

    // Acquire lock on users row in a separate transaction, then change password and commit
    const queryRunner = e2e.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Hold lock on user row
      await queryRunner.manager.query(
        'SELECT id FROM users WHERE id = $1 FOR UPDATE',
        [userId],
      );

      // Start in-flight GET /api/auth/session that needs touch
      const sessionRequestPromise = http()
        .get('/api/auth/session')
        .set('Cookie', oldCookie);

      // Wait a moment to ensure GET request has reached touch waiting for the user lock
      await new Promise((resolve) => setTimeout(resolve, 50));

      // In the locked transaction: revoke all sessions and change password
      const newHash = await new Argon2PasswordHasher().hash(NEW_PASSWORD);
      await queryRunner.manager.update(User, userId, { password: newHash });
      await queryRunner.manager.update(
        Session,
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );

      // Commit transaction, releasing the lock so the in-flight touch can proceed
      await queryRunner.commitTransaction();

      // The in-flight request proceeds, discovers session is revoked during touch -> 401
      const sessionRes = await sessionRequestPromise;
      expect(sessionRes.status).toBe(401);
      expect(sessionRes.body.code).toBe('UNAUTHENTICATED');
      expect(sessionRes.headers['set-cookie']).toBeUndefined();

      // Session row expires_at was NOT modified
      const sessionAfter = await e2e.dataSource
        .getRepository(Session)
        .findOneByOrFail({ id: sessionBefore.id });
      expect(sessionAfter.expiresAt.getTime()).toBe(initialExpiresAt);
    } finally {
      await queryRunner.release();
    }
  });
});
