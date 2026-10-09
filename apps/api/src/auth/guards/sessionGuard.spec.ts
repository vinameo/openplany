import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/apiException.js';
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
} from '../../../test/fakes/authFakes.js';
import { AuthService } from '../auth.service.js';
import { AllowResetOnlySession } from '../currentUser.decorator.js';
import { SessionCookie } from '../sessionCookie.js';
import { SessionGuard } from './sessionGuard.js';

const COOKIE = 'op_session';

class PlainController {
  handler(): void {}
}

class ResetController {
  @AllowResetOnlySession()
  handler(): void {}
}

function setup() {
  const sessions = new FakeSessionsRepository();
  const config = new ConfigService({
    AUTH_HMAC_SECRET: 'test-secret-that-is-at-least-32-characters',
    SESSION_TTL_DAYS: 7,
    SESSION_ABSOLUTE_TTL_DAYS: 30,
    SESSION_COOKIE_SECURE: false,
    NODE_ENV: 'test',
  });
  const authService = new AuthService(
    new FakeUsersRepository(),
    sessions,
    new FakeLoginAttemptsRepository(),
    new FakePasswordHasher(),
    new FakeRateLimiter(),
    new FakeClock(),
    config,
  );
  const guard = new SessionGuard(
    authService,
    new SessionCookie(config),
    new Reflector(),
  );
  return { guard, sessions };
}

function contextFor(
  controller: new () => object,
  cookies: Record<string, string>,
) {
  const request = { cookies } as unknown as Request;
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const response = { cookie, clearCookie } as unknown as Response;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
    getHandler: () => controller.prototype.handler,
    getClass: () => controller,
  } as unknown as ExecutionContext;
  return { context, request, cookie, clearCookie };
}

async function expectApiError(
  promise: Promise<unknown>,
  status: HttpStatus,
  code: string,
): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ApiException);
  expect((error as ApiException).getStatus()).toBe(status);
  expect((error as ApiException).code).toBe(code);
}

describe('SessionGuard', () => {
  it('throws UNAUTHENTICATED without a cookie', async () => {
    const { guard } = setup();
    const { context, clearCookie } = contextFor(PlainController, {});

    await expectApiError(
      guard.canActivate(context),
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
    );
    expect(clearCookie).not.toHaveBeenCalled();
  });

  it('clears a cookie that maps to no live session', async () => {
    const { guard } = setup();
    const { context, clearCookie } = contextFor(PlainController, {
      [COOKIE]: 'stale-token',
    });

    await expectApiError(
      guard.canActivate(context),
      HttpStatus.UNAUTHORIZED,
      'UNAUTHENTICATED',
    );
    expect(clearCookie).toHaveBeenCalledWith(COOKIE, expect.any(Object));
  });

  it('attaches the user of a live session to the request', async () => {
    const { guard, sessions } = setup();
    sessions.active = { session: makeSession(), user: makeUser() };
    const { context, request } = contextFor(PlainController, {
      [COOKIE]: 'token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.auth).toEqual({
      userId: 'user-1',
      isResetOnly: false,
      isInstanceAdmin: false,
    });
  });

  it('attaches isInstanceAdmin: true when the user is a superuser', async () => {
    const { guard, sessions } = setup();
    sessions.active = {
      session: makeSession(),
      user: makeUser({ isSuperuser: true }),
    };
    const { context, request } = contextFor(PlainController, {
      [COOKIE]: 'token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.auth?.isInstanceAdmin).toBe(true);
  });

  it('refreshes the cookie when the session expiry slid', async () => {
    const { guard, sessions } = setup();
    sessions.active = {
      session: makeSession({
        lastUsedAt: new Date(NOW.getTime() - 10 * 60_000),
      }),
      user: makeUser(),
    };
    const { context, cookie } = contextFor(PlainController, {
      [COOKIE]: 'token',
    });

    await guard.canActivate(context);

    expect(cookie).toHaveBeenCalledWith(COOKIE, 'token', expect.any(Object));
  });

  it('refuses a reset-only session with PASSWORD_RESET_REQUIRED', async () => {
    const { guard, sessions } = setup();
    sessions.active = {
      session: makeSession({ isResetOnly: true }),
      user: makeUser(),
    };
    const { context } = contextFor(PlainController, { [COOKIE]: 'token' });

    await expectApiError(
      guard.canActivate(context),
      HttpStatus.FORBIDDEN,
      'PASSWORD_RESET_REQUIRED',
    );
  });

  it('lets a reset-only session through a handler that opts in', async () => {
    const { guard, sessions } = setup();
    sessions.active = {
      session: makeSession({ isResetOnly: true }),
      user: makeUser(),
    };
    const { context, request } = contextFor(ResetController, {
      [COOKIE]: 'token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(request.auth?.isResetOnly).toBe(true);
  });
});
