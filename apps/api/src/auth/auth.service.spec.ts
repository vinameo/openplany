import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiException } from '../common/apiException.js';
import {
  FakeClock,
  FakeLoginAttemptsRepository,
  FakePasswordHasher,
  FakeRateLimiter,
  FakeSessionsRepository,
  FakeUsersRepository,
  makeSession,
  makeUser,
  NOW,
} from '../../test/fakes/authFakes.js';
import { AuthService, type RequestContext } from './auth.service.js';
import { hashEmail, hashSessionToken } from './authTokens.js';
import type { User } from './entities/user.entity.js';

const SECRET = 'test-secret-that-is-at-least-32-characters';
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const CONTEXT: RequestContext = {
  requestId: 'req-1',
  ip: '203.0.113.7',
  userAgent: 'vitest',
};

async function setup(users: User[] = [makeUser()]) {
  const deps = {
    users: new FakeUsersRepository(),
    sessions: new FakeSessionsRepository(),
    attempts: new FakeLoginAttemptsRepository(),
    hasher: new FakePasswordHasher(),
    rateLimiter: new FakeRateLimiter(),
    clock: new FakeClock(),
  };
  deps.users.users.push(...users);
  const config = new ConfigService({
    AUTH_HMAC_SECRET: SECRET,
    SESSION_TTL_DAYS: 7,
    SESSION_ABSOLUTE_TTL_DAYS: 30,
  });
  const service = new AuthService(
    deps.users,
    deps.sessions,
    deps.attempts,
    deps.hasher,
    deps.rateLimiter,
    deps.clock,
    config,
  );
  await service.onModuleInit();
  return { service, ...deps };
}

async function expectApiError(
  promise: Promise<unknown>,
  status: HttpStatus,
  code: string,
): Promise<ApiException> {
  const error: unknown = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(ApiException);
  const apiError = error as ApiException;
  expect(apiError.getStatus()).toBe(status);
  expect(apiError.code).toBe(code);
  return apiError;
}

describe('AuthService', () => {
  describe('signIn', () => {
    it('creates a 7-day session and records the login for a valid user', async () => {
      const { service, sessions } = await setup();

      const result = await service.signIn(
        { email: 'an@openplany.dev', password: 'Secret123!' },
        CONTEXT,
      );

      expect(result.body).toEqual({
        user: {
          id: 'user-1',
          email: 'an@openplany.dev',
          displayName: 'An Nguyen',
          firstName: 'An',
          lastName: 'Nguyen',
          avatarUrl: null,
          timezone: 'Asia/Ho_Chi_Minh',
          isEmailVerified: true,
          isInstanceAdmin: false,
        },
        requiresPasswordReset: false,
      });
      expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 7 * DAY));
      expect(sessions.signIns).toHaveLength(1);
      const [record] = sessions.signIns;
      expect(record.session).toEqual({
        tokenHash: hashSessionToken(result.token),
        expiresAt: result.expiresAt,
        isResetOnly: false,
      });
      expect(record.attempt).toMatchObject({ result: 'success', reason: null });
      expect(record).toMatchObject({ ip: CONTEXT.ip, userAgent: 'vitest' });
    });

    it('stores an HMAC of the email, never the email itself', async () => {
      const { service, sessions } = await setup();

      await service.signIn(
        { email: 'an@openplany.dev', password: 'Secret123!' },
        CONTEXT,
      );

      expect(sessions.signIns[0].attempt.emailHash).toBe(
        hashEmail(SECRET, 'an@openplany.dev'),
      );
    });

    it('truncates the user agent to 512 characters', async () => {
      const { service, sessions } = await setup();

      await service.signIn(
        { email: 'an@openplany.dev', password: 'Secret123!' },
        { ...CONTEXT, userAgent: 'x'.repeat(2000) },
      );

      expect(sessions.signIns[0].userAgent).toHaveLength(512);
    });

    it('rejects an unknown email with the generic error after a dummy verify', async () => {
      const { service, hasher, attempts, sessions } = await setup([]);

      const error = await expectApiError(
        service.signIn(
          { email: 'ghost@openplany.dev', password: 'x' },
          CONTEXT,
        ),
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );

      expect(error.message).toBe('Incorrect email or password');
      expect(hasher.verified).toHaveLength(1);
      expect(attempts.recorded).toEqual([
        expect.objectContaining({
          result: 'failure',
          reason: 'unknown_email',
          userId: null,
        }),
      ]);
      expect(sessions.signIns).toHaveLength(0);
    });

    it.each([
      ['masked', { maskedAt: NOW }],
      ['bot', { isBot: true }],
      ['password_not_set', { isPasswordAutoset: true }],
    ] as const)(
      'treats a %s account like an unknown email, even with the right password',
      async (reason, overrides) => {
        const user = makeUser(overrides);
        const { service, hasher, attempts } = await setup([user]);

        await expectApiError(
          service.signIn(
            { email: 'an@openplany.dev', password: 'Secret123!' },
            CONTEXT,
          ),
          HttpStatus.UNAUTHORIZED,
          'INVALID_CREDENTIALS',
        );

        expect(hasher.verified).not.toContain(user.password);
        expect(attempts.recorded[0]).toMatchObject({
          reason,
          userId: 'user-1',
        });
      },
    );

    it('rejects a wrong password and leaves the user untouched', async () => {
      const { service, attempts, sessions } = await setup();

      await expectApiError(
        service.signIn(
          { email: 'an@openplany.dev', password: 'nope' },
          CONTEXT,
        ),
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );

      expect(attempts.recorded[0]).toMatchObject({ reason: 'wrong_password' });
      expect(sessions.signIns).toHaveLength(0);
    });

    it('returns identical errors for an unknown email and a wrong password', async () => {
      const { service } = await setup();

      const unknown = await expectApiError(
        service.signIn(
          { email: 'ghost@openplany.dev', password: 'x' },
          CONTEXT,
        ),
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );
      const wrong = await expectApiError(
        service.signIn({ email: 'an@openplany.dev', password: 'x' }, CONTEXT),
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );

      expect(wrong.getResponse()).toEqual(unknown.getResponse());
    });

    it('throws ACCOUNT_DEACTIVATED only once the password is correct', async () => {
      const { service, attempts, sessions } = await setup([
        makeUser({ isActive: false }),
      ]);

      await expectApiError(
        service.signIn(
          { email: 'an@openplany.dev', password: 'nope' },
          CONTEXT,
        ),
        HttpStatus.UNAUTHORIZED,
        'INVALID_CREDENTIALS',
      );
      await expectApiError(
        service.signIn(
          { email: 'an@openplany.dev', password: 'Secret123!' },
          CONTEXT,
        ),
        HttpStatus.FORBIDDEN,
        'ACCOUNT_DEACTIVATED',
      );

      expect(attempts.recorded.map((attempt) => attempt.reason)).toEqual([
        'wrong_password',
        'inactive',
      ]);
      expect(sessions.signIns).toHaveLength(0);
    });

    it('throws SSO_REQUIRED for a managed account', async () => {
      const { service, attempts } = await setup([
        makeUser({ isManaged: true }),
      ]);

      await expectApiError(
        service.signIn(
          { email: 'an@openplany.dev', password: 'Secret123!' },
          CONTEXT,
        ),
        HttpStatus.FORBIDDEN,
        'SSO_REQUIRED',
      );
      expect(attempts.recorded[0]).toMatchObject({ reason: 'managed_sso' });
    });

    it.each([
      ['expired', { isPasswordExpired: true }],
      ['reset-required', { isPasswordResetRequired: true }],
    ] as const)(
      'issues a 15-minute reset-only session for a %s password',
      async (_label, overrides) => {
        const { service, sessions } = await setup([makeUser(overrides)]);

        const result = await service.signIn(
          { email: 'an@openplany.dev', password: 'Secret123!' },
          CONTEXT,
        );

        expect(result.body.requiresPasswordReset).toBe(true);
        expect(result.expiresAt).toEqual(new Date(NOW.getTime() + 15 * MINUTE));
        expect(sessions.signIns[0].session.isResetOnly).toBe(true);
        expect(sessions.signIns[0].attempt).toMatchObject({
          result: 'success',
          reason: 'reset_required',
        });
      },
    );

    it('rehashes a password stored with an outdated algorithm', async () => {
      const { service, sessions, hasher } = await setup();
      hasher.needsRehash = true;

      await service.signIn(
        { email: 'an@openplany.dev', password: 'Secret123!' },
        CONTEXT,
      );

      expect(sessions.signIns[0].rehashedPassword).toBe('hash:Secret123!');
    });

    it('blocks with TOO_MANY_ATTEMPTS before looking the user up', async () => {
      const { service, rateLimiter, users, attempts } = await setup();
      rateLimiter.decision = { blocked: true, retryAfterSeconds: 600 };

      const error = await expectApiError(
        service.signIn(
          { email: 'an@openplany.dev', password: 'Secret123!' },
          CONTEXT,
        ),
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
      );

      expect(error.retryAfterSeconds).toBe(600);
      expect(error.message).toBe('Too many attempts. Try again in 10 minutes.');
      expect(users.lookups).toBe(0);
      expect(attempts.recorded[0]).toMatchObject({
        result: 'blocked',
        reason: 'rate_limited',
      });
    });

    it('waits out the slowdown delay before answering', async () => {
      const { service, rateLimiter, clock } = await setup();
      rateLimiter.decision = { blocked: false, delayMs: 2000 };

      await service.signIn(
        { email: 'an@openplany.dev', password: 'Secret123!' },
        CONTEXT,
      );

      expect(clock.sleeps).toEqual([2000]);
    });
  });

  describe('getSession', () => {
    it('returns null when the token has no active session', async () => {
      const { service } = await setup();

      expect(await service.getSession('token')).toBeNull();
    });

    it.each([
      ['inactive', { isActive: false }],
      ['masked', { maskedAt: NOW }],
    ] as const)('returns null for a %s user', async (_label, overrides) => {
      const { service, sessions } = await setup();
      sessions.active = { session: makeSession(), user: makeUser(overrides) };

      expect(await service.getSession('token')).toBeNull();
    });

    it('does not write when the session was used in the last 5 minutes', async () => {
      const { service, sessions, clock } = await setup();
      sessions.active = { session: makeSession(), user: makeUser() };
      clock.current = new Date(NOW.getTime() + 4 * MINUTE);

      const result = await service.getSession('token');

      expect(result?.renewedExpiresAt).toBeNull();
      expect(sessions.touches).toHaveLength(0);
    });

    it('slides the expiry by 7 days once the session is stale', async () => {
      const { service, sessions, clock } = await setup();
      sessions.active = { session: makeSession(), user: makeUser() };
      clock.current = new Date(NOW.getTime() + 6 * MINUTE);

      const result = await service.getSession('token');

      const expected = new Date(clock.current.getTime() + 7 * DAY);
      expect(result?.renewedExpiresAt).toEqual(expected);
      expect(sessions.touches[0].expiresAt).toEqual(expected);
    });

    it('caps the sliding expiry at 30 days after creation', async () => {
      const { service, sessions, clock } = await setup();
      sessions.active = { session: makeSession(), user: makeUser() };
      clock.current = new Date(NOW.getTime() + 28 * DAY);

      const result = await service.getSession('token');

      expect(result?.renewedExpiresAt).toEqual(
        new Date(NOW.getTime() + 30 * DAY),
      );
    });

    it('never extends a reset-only session', async () => {
      const { service, sessions, clock } = await setup();
      sessions.active = {
        session: makeSession({ isResetOnly: true }),
        user: makeUser(),
      };
      clock.current = new Date(NOW.getTime() + 10 * MINUTE);

      const result = await service.getSession('token');

      expect(result?.body.requiresPasswordReset).toBe(true);
      expect(sessions.touches).toHaveLength(0);
    });
  });

  describe('signOut', () => {
    it('revokes the session behind the token', async () => {
      const { service, sessions } = await setup();

      await service.signOut('token', '203.0.113.7');

      expect(sessions.revocations).toEqual([
        { tokenHash: hashSessionToken('token'), ip: '203.0.113.7', now: NOW },
      ]);
    });

    it('does nothing without a token', async () => {
      const { service, sessions } = await setup();

      await service.signOut(null, '203.0.113.7');

      expect(sessions.revocations).toHaveLength(0);
    });
  });
});
