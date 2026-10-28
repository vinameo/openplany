import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import type { ModuleRef, Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import {
  WRITE_LIMIT_KEY,
  type WriteLimit,
} from '../projects/access/writeLimit.js';
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

  it('logs bucket=workspace_write by default when rejecting', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const guard = new WorkspaceWriteRateLimitGuard(limiter, clock);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});

    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId: 'user-default' },
          requestId: 'req-def',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'workspace.write.rate_limited userId=user-default bucket=workspace_write requestId=req-def',
    );
    warnSpy.mockRestore();
  });

  it('selects custom limiter, bucket and message when handler has WriteLimit metadata', () => {
    const defaultLimiter = new InMemorySlidingWindowLimiter({
      limit: 10,
      windowMs: 600_000,
    });
    const customLimiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const CUSTOM_TOKEN = Symbol('CUSTOM_LIMITER');
    const writeLimit: WriteLimit = {
      limiterToken: CUSTOM_TOKEN,
      bucket: 'custom_bucket',
      message: { key: 'errors:tooManyWorkspaceWrites' },
    };

    const handler = () => {};
    const reflector = {
      get: vi.fn((key: string, target: unknown) => {
        if (key === WRITE_LIMIT_KEY && target === handler) {
          return writeLimit;
        }
        return undefined;
      }),
    } as unknown as Reflector;

    const getLimiter = vi.fn((token: unknown) => {
      if (token === CUSTOM_TOKEN) {
        return customLimiter;
      }
      throw new Error('Unknown token');
    });
    const moduleRef = {
      get: getLimiter,
    } as unknown as ModuleRef;

    const guard = new WorkspaceWriteRateLimitGuard(
      defaultLimiter,
      clock,
      reflector,
      moduleRef,
    );
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const defaultHitSpy = vi.spyOn(defaultLimiter, 'hit');
    const customHitSpy = vi.spyOn(customLimiter, 'hit');

    const ctx = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId: 'user-custom' },
          requestId: 'req-cust',
        }),
      }),
    } as unknown as ExecutionContext;

    // First request passes custom limiter
    expect(guard.canActivate(ctx)).toBe(true);
    expect(getLimiter).toHaveBeenCalledWith(CUSTOM_TOKEN, { strict: false });
    expect(customHitSpy).toHaveBeenCalledTimes(1);
    expect(defaultHitSpy).not.toHaveBeenCalled();

    // Second request rejected by custom limiter with custom message and bucket
    expect(() => guard.canActivate(ctx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.TOO_MANY_REQUESTS,
        code: 'TOO_MANY_ATTEMPTS',
        messageRef: { key: 'errors:tooManyWorkspaceWrites' },
      }),
    );
    expect(customHitSpy).toHaveBeenCalledTimes(2);
    expect(defaultHitSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'workspace.write.rate_limited userId=user-custom bucket=custom_bucket requestId=req-cust',
    );
    warnSpy.mockRestore();
  });

  it('logs custom logEvent when configured on writeLimit', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const CUSTOM_TOKEN = Symbol('CUSTOM');
    const writeLimit: WriteLimit = {
      limiterToken: CUSTOM_TOKEN,
      bucket: 'state_write',
      message: { key: 'errors:tooManyWorkspaceWrites' },
      logEvent: 'state.write.rate_limited',
    };
    const handler = () => {};
    const reflector = {
      get: (k: string, t: unknown) =>
        k === WRITE_LIMIT_KEY && t === handler ? writeLimit : undefined,
    } as unknown as Reflector;
    const moduleRef = { get: () => limiter } as unknown as ModuleRef;
    const guard = new WorkspaceWriteRateLimitGuard(
      limiter,
      clock,
      reflector,
      moduleRef,
    );
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const ctx = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId: 'u1' },
          requestId: 'req1',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      'state.write.rate_limited userId=u1 bucket=state_write requestId=req1',
    );
    warnSpy.mockRestore();
  });

  it('logs only once per window when logOncePerWindow is true', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 1,
      windowMs: 600_000,
    });
    const clock = new FakeClock();
    const CUSTOM_TOKEN = Symbol('CUSTOM');
    const writeLimit: WriteLimit = {
      limiterToken: CUSTOM_TOKEN,
      bucket: 'state_write',
      message: { key: 'errors:tooManyWorkspaceWrites' },
      logEvent: 'state.write.rate_limited',
      logOncePerWindow: true,
    };
    const handler = () => {};
    const reflector = {
      get: (k: string, t: unknown) =>
        k === WRITE_LIMIT_KEY && t === handler ? writeLimit : undefined,
    } as unknown as Reflector;
    const moduleRef = { get: () => limiter } as unknown as ModuleRef;
    const guard = new WorkspaceWriteRateLimitGuard(
      limiter,
      clock,
      reflector,
      moduleRef,
    );
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const ctx = {
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          auth: { userId: 'u1' },
          requestId: 'req1',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(); // 1st blocked hit -> logs
    expect(() => guard.canActivate(ctx)).toThrow(); // 2nd blocked hit -> does not log again
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
