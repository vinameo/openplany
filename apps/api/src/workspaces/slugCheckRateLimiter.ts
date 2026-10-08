import { Injectable } from '@nestjs/common';

export interface RateLimitCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export abstract class SlugCheckRateLimiter {
  abstract check(userId: string, now: Date): RateLimitCheckResult;
}

@Injectable()
export class InMemorySlugCheckRateLimiter implements SlugCheckRateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(userId: string, now: Date): RateLimitCheckResult {
    const nowMs = now.getTime();
    const windowMs = 60 * 1000;
    const limit = 60;

    const existing = this.hits.get(userId) ?? [];
    const valid = existing.filter((ts) => ts > nowMs - windowMs);

    if (valid.length >= limit) {
      const oldest = valid[0]!;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - nowMs) / 1000),
      );
      this.hits.set(userId, valid);
      return { allowed: false, retryAfterSeconds };
    }

    valid.push(nowMs);
    this.hits.set(userId, valid);
    return { allowed: true };
  }
}

