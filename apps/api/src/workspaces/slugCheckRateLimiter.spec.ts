import { describe, expect, it } from 'vitest';
import { InMemorySlugCheckRateLimiter } from './slugCheckRateLimiter.js';

describe('InMemorySlugCheckRateLimiter', () => {
  it('allows 60 requests per minute and blocks the 61st request', () => {
    const limiter = new InMemorySlugCheckRateLimiter();
    const userId = 'user-test-limiter';
    const startTime = new Date('2026-10-08T12:00:00.000Z');

    // First 60 requests allowed
    for (let i = 0; i < 60; i++) {
      const time = new Date(startTime.getTime() + i * 500); // 1 request every 500ms
      const result = limiter.check(userId, time);
      expect(result.allowed).toBe(true);
    }

    // 61st request within the 60s window is blocked
    const blockedTime = new Date(startTime.getTime() + 30000);
    const blockedResult = limiter.check(userId, blockedTime);
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.retryAfterSeconds).toBeGreaterThan(0);
    expect(blockedResult.retryAfterSeconds).toBeLessThanOrEqual(60);

    // After window expires (> 60s after first request)
    const futureTime = new Date(startTime.getTime() + 61000);
    const allowedAgain = limiter.check(userId, futureTime);
    expect(allowedAgain.allowed).toBe(true);
  });
});

