import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { createActorRateLimitGuard } from './actorRateLimitGuard.js';
import { InMemorySlidingWindowLimiter } from './slidingWindowLimiter.js';

describe('actorRateLimitGuard', () => {
  function makeCtx(
    auth?: { userId: string },
    requestId = 'test-req',
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          auth,
          requestId,
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('throws UNAUTHENTICATED when userId is missing', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 20,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const GuardClass = createActorRateLimitGuard({
      limiterToken: 'TEST_LIMITER',
      messageKey: 'errors:tooManyUsersCreatedLater',
      logLabel: 'test.rate_limited',
    });
    const guard = new GuardClass(limiter, clock);

    expect(() => guard.canActivate(makeCtx(undefined))).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue',
      }),
    );
  });

  it('allows hits up to limit and rejects with 429, retryAfterSeconds, and only logs on firstBlockInWindow (API B1, B2.2)', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 20,
      windowMs: 600_000,
    });
    const clock = new FakeClock(new Date('2026-10-09T10:00:00.000Z'));
    const GuardClass = createActorRateLimitGuard({
      limiterToken: 'USER_CREATE_LIMITER',
      messageKey: 'errors:tooManyUsersCreatedLater',
      logLabel: 'admin.users.rate_limited',
    });
    const guard = new GuardClass(limiter, clock);

    try {
      for (let i = 0; i < 20; i++) {
        expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
      }
      expect(warnSpy).not.toHaveBeenCalled();

      // 21st request: first block -> logs warning
      expect(() =>
        guard.canActivate(makeCtx({ userId: 'admin-1' }, 'req-99')),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many users created. Try again later.',
        }),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(
        'admin.users.rate_limited userId=admin-1 requestId=req-99',
      );

      // 22nd request: subsequent block in window -> does NOT log again
      expect(() =>
        guard.canActivate(makeCtx({ userId: 'admin-1' }, 'req-100')),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
        }),
      );
      expect(warnSpy).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('supports role permissions write limiter configuration with corresponding message and log label', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 30,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const GuardClass = createActorRateLimitGuard({
      limiterToken: 'ROLE_PERMISSIONS_WRITE_LIMITER',
      messageKey: 'errors:tooManyRolePermissionUpdates',
      logLabel: 'admin.role_permissions.rate_limited',
    });
    const guard = new GuardClass(limiter, clock);

    try {
      for (let i = 0; i < 30; i++) {
        expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
      }

      expect(() =>
        guard.canActivate(makeCtx({ userId: 'admin-1' }, 'req-role-1')),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many role permission updates. Try again later.',
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        'admin.role_permissions.rate_limited userId=admin-1 requestId=req-role-1',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('supports custom formatLog option', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 10_000,
    });
    const clock = new FakeClock();
    const GuardClass = createActorRateLimitGuard({
      limiterToken: 'TEST_LIMITER',
      messageKey: 'errors:tooManyUsersCreatedLater',
      formatLog: ({ userId, requestId }) =>
        `custom.rate_limited uid=${userId} req=${requestId}`,
    });
    const guard = new GuardClass(limiter, clock);

    try {
      expect(guard.canActivate(makeCtx({ userId: 'u-1' }))).toBe(true);
      expect(() =>
        guard.canActivate(makeCtx({ userId: 'u-1' }, 'custom-req')),
      ).toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        'custom.rate_limited uid=u-1 req=custom-req',
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('tracks rate limit per userId independently', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 2,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const GuardClass = createActorRateLimitGuard({
      limiterToken: 'TEST_LIMITER',
      messageKey: 'errors:tooManyUsersCreatedLater',
      logLabel: 'test.rate_limited',
    });
    const guard = new GuardClass(limiter, clock);

    expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
    expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
    expect(() => guard.canActivate(makeCtx({ userId: 'admin-1' }))).toThrow();

    // admin-2 is unaffected
    expect(guard.canActivate(makeCtx({ userId: 'admin-2' }))).toBe(true);
  });
});
