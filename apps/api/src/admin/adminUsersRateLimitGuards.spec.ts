import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import {
  AdminUsersReadRateLimitGuard,
  AdminUsersWriteRateLimitGuard,
} from './adminUsersRateLimitGuards.js';

describe('AdminUsersRateLimitGuards', () => {
  function makeCtx(auth?: { userId: string }): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ auth }),
      }),
    } as unknown as ExecutionContext;
  }

  describe('AdminUsersReadRateLimitGuard', () => {
    it('allows 120 requests and rejects 121st with 429 and admin:errors.tooManyRequests', () => {
      const limiter = new InMemorySlidingWindowLimiter({
        limit: 120,
        windowMs: 60_000,
      });
      const clock = new FakeClock();
      const guard = new AdminUsersReadRateLimitGuard(limiter, clock);

      for (let i = 0; i < 120; i++) {
        expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
      }

      expect(() =>
        guard.canActivate(makeCtx({ userId: 'admin-1' })),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
          messageRef: { key: 'admin:errors.tooManyRequests' },
        }),
      );
    });
  });

  describe('AdminUsersWriteRateLimitGuard', () => {
    it('allows 60 requests and rejects 61st with 429 and admin:errors.tooManyUserChanges', () => {
      const limiter = new InMemorySlidingWindowLimiter({
        limit: 60,
        windowMs: 600_000,
      });
      const clock = new FakeClock();
      const guard = new AdminUsersWriteRateLimitGuard(limiter, clock);

      for (let i = 0; i < 60; i++) {
        expect(guard.canActivate(makeCtx({ userId: 'admin-1' }))).toBe(true);
      }

      expect(() =>
        guard.canActivate(makeCtx({ userId: 'admin-1' })),
      ).toThrowError(
        expect.objectContaining({
          status: HttpStatus.TOO_MANY_REQUESTS,
          code: 'TOO_MANY_ATTEMPTS',
          messageRef: { key: 'admin:errors.tooManyUserChanges' },
        }),
      );
    });
  });
});
