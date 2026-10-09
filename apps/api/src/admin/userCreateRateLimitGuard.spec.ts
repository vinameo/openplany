import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { UserCreateRateLimitGuard } from './userCreateRateLimitGuard.js';

describe('UserCreateRateLimitGuard', () => {
  function makeCtx(auth?: { userId: string }, requestId = 'test-req'): ExecutionContext {
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
    const limiter = new InMemorySlidingWindowLimiter({ limit: 20, windowMs: 600_000 });
    const clock = new FakeClock();
    const guard = new UserCreateRateLimitGuard(limiter, clock);

    expect(() => guard.canActivate(makeCtx(undefined))).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue',
      }),
    );
  });

  it('allows 20 requests and rejects the 21st with 429 and retryAfterSeconds', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const limiter = new InMemorySlidingWindowLimiter({ limit: 20, windowMs: 600_000 });
    const clock = new FakeClock(new Date('2026-10-09T10:00:00.000Z'));
    const guard = new UserCreateRateLimitGuard(limiter, clock);

    try {
      for (let i = 0; i < 20; i++) {
        expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
      }

      // 21st request
      expect(() => guard.canActivate(makeCtx({ userId: 'admin-1' }, 'req-99'))).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Too many users created. Try again later.',
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith('admin.users.rate_limited userId=admin-1 requestId=req-99');

      // 22nd request with no requestId
      expect(() =>
        guard.canActivate({
          switchToHttp: () => ({
            getRequest: () => ({ auth: { userId: 'admin-1' } }),
          }),
        } as unknown as ExecutionContext),
      ).toThrow();
      expect(warnSpy).toHaveBeenCalledWith('admin.users.rate_limited userId=admin-1 requestId=');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('counts rate limit by userId independently', () => {
    const limiter = new InMemorySlidingWindowLimiter({ limit: 2, windowMs: 600_000 });
    const clock = new FakeClock();
    const guard = new UserCreateRateLimitGuard(limiter, clock);

    expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
    expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
    expect(() => guard.canActivate(makeCtx({ userId: 'admin-1' }))).toThrow();

    // admin-2 is unaffected
    expect(guard.canActivate(makeCtx({ userId: 'admin-2' }))).toBe(true);
  });
});
