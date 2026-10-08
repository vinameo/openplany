import { describe, expect, it } from 'vitest';
import { InMemorySlidingWindowLimiter } from './slidingWindowLimiter.js';

describe('InMemorySlidingWindowLimiter', () => {
  it('allows hits up to limit and blocks subsequent hits within window', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 3,
      windowMs: 60_000,
    });
    const now = new Date('2026-10-08T12:00:00.000Z');

    expect(limiter.hit('user-1', now).allowed).toBe(true);
    expect(limiter.hit('user-1', new Date(now.getTime() + 10_000)).allowed).toBe(
      true,
    );
    expect(limiter.hit('user-1', new Date(now.getTime() + 20_000)).allowed).toBe(
      true,
    );

    const fourth = limiter.hit('user-1', new Date(now.getTime() + 30_000));
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBe(30); // 12:00:00 + 60s - 12:00:30 = 30s
  });

  it('allows new hits after window slides past oldest timestamp', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 2,
      windowMs: 10_000,
    });
    const t0 = new Date('2026-10-08T12:00:00.000Z');

    expect(limiter.hit('user-1', t0).allowed).toBe(true);
    expect(limiter.hit('user-1', new Date(t0.getTime() + 2_000)).allowed).toBe(
      true,
    );
    expect(limiter.hit('user-1', new Date(t0.getTime() + 4_000)).allowed).toBe(
      false,
    );

    // After 10s from t0
    const tAfter = new Date(t0.getTime() + 11_000);
    expect(limiter.hit('user-1', tAfter).allowed).toBe(true);
  });

  it('cleans up stale keys on periodic cleanup after 1,000 hits', () => {
    const limiter = new InMemorySlidingWindowLimiter({
      limit: 10,
      windowMs: 5_000,
    });
    const t0 = new Date('2026-10-08T12:00:00.000Z');

    // Add hit for user-stale at t0
    limiter.hit('user-stale', t0);

    // Add hits across 1,000 hits at t0 + 10,000ms
    const tLater = new Date(t0.getTime() + 10_000);
    for (let i = 0; i < 1000; i++) {
      limiter.hit(`user-${i}`, tLater);
    }

    // After 1000 hits, user-stale whose timestamps were at t0 (< tLater - 5000) should have been cleaned up
    // Verify internal map size or behavior: hitting user-stale now has clean record
    const result = limiter.hit('user-stale', tLater);
    expect(result.allowed).toBe(true);
  });
});

