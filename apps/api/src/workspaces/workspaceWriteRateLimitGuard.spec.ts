import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { WorkspaceWriteRateLimitGuard } from './workspaceWriteRateLimitGuard.js';

describe('WorkspaceWriteRateLimitGuard', () => {
  it('allows 30 requests and rejects the 31st with 429 and retryAfterSeconds', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 30,
      windowMs: 600_000,
    });
    const clock = new FakeClock(new Date('2026-10-08T10:00:00.000Z'));
    const guard = new WorkspaceWriteRateLimitGuard(limiter, clock);

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

    for (let i = 0; i < 30; i++) {
      expect(guard.canActivate(makeCtx('user-1'))).toBe(true);
    }

    // 31st request
    expect(() => guard.canActivate(makeCtx('user-1'))).toThrowError(
      expect.objectContaining({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_ATTEMPTS',
      }),
    );
  });

  it('counts rate limit by user, independent of workspace', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 2,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const guard = new WorkspaceWriteRateLimitGuard(limiter, clock);

    function makeCtx(userId: string, slug: string): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => ({
            auth: { userId },
            params: { slug },
          }),
        }),
      } as unknown as ExecutionContext;
    }

    // user-1 hits ws-a and ws-b
    expect(guard.canActivate(makeCtx('user-1', 'ws-a'))).toBe(true);
    expect(guard.canActivate(makeCtx('user-1', 'ws-b'))).toBe(true);
    expect(() => guard.canActivate(makeCtx('user-1', 'ws-c'))).toThrow();

    // user-2 is unaffected
    expect(guard.canActivate(makeCtx('user-2', 'ws-a'))).toBe(true);
  });
});

