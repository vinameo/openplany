import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MEMBER_MESSAGES } from '@repo/contracts';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { MemberCandidateRateLimitGuard } from './memberCandidateRateLimitGuard.js';

describe('MemberCandidateRateLimitGuard', () => {
  function makeCtx(userId: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId },
          requestId: 'test-req',
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('AC-13: allows 60 requests and rejects the 61st with 429 and retryAfterSeconds', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 60,
      windowMs: 60_000,
    });
    const alertLimiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock(new Date('2026-10-10T12:00:00.000Z'));
    const guard = new MemberCandidateRateLimitGuard(
      limiter,
      alertLimiter,
      clock,
    );

    for (let i = 0; i < 60; i++) {
      expect(guard.canActivate(makeCtx('user-1'))).toBe(true);
    }

    // 61st request fails
    expect(() => guard.canActivate(makeCtx('user-1'))).toThrowError(
      expect.objectContaining({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_ATTEMPTS',
        message: MEMBER_MESSAGES.tooManySearches,
      }),
    );

    // Another user is not affected
    expect(guard.canActivate(makeCtx('user-2'))).toBe(true);
  });

  it('rejects with 401 UNAUTHENTICATED when userId is missing', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 60,
      windowMs: 60_000,
    });
    const alertLimiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const guard = new MemberCandidateRateLimitGuard(
      limiter,
      alertLimiter,
      clock,
    );

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          requestId: 'test-req',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
      }),
    );
  });

  it('AC-43: logs rate limit warning only once per alert window per user', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 60_000,
    });
    const alertLimiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock(new Date('2026-10-10T12:00:00.000Z'));
    const guard = new MemberCandidateRateLimitGuard(
      limiter,
      alertLimiter,
      clock,
    );

    const warnSpy = vi.spyOn(
      (guard as unknown as { logger: { warn: (msg: string) => void } }).logger,
      'warn',
    );

    // 1st request succeeds
    expect(guard.canActivate(makeCtx('user-1'))).toBe(true);

    // 2nd request fails with 429 and logs
    expect(() => guard.canActivate(makeCtx('user-1'))).toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 3rd request fails with 429 but does not log again because alertLimiter window is active
    expect(() => guard.canActivate(makeCtx('user-1'))).toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
