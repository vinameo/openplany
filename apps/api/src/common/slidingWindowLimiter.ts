export interface SlidingWindowDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export abstract class SlidingWindowLimiter {
  abstract hit(key: string, now: Date): SlidingWindowDecision;
}

export interface InMemorySlidingWindowLimiterOptions {
  limit: number;
  windowMs: number;
}

export class InMemorySlidingWindowLimiter extends SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private hitCounter = 0;

  constructor(private readonly options: InMemorySlidingWindowLimiterOptions) {
    super();
  }

  hit(key: string, now: Date): SlidingWindowDecision {
    const nowMs = now.getTime();
    const windowMs = this.options.windowMs;
    const limit = this.options.limit;

    this.hitCounter++;
    if (this.hitCounter >= 1000) {
      this.hitCounter = 0;
      this.cleanup(nowMs);
    }

    const existing = this.hits.get(key) ?? [];
    const valid = existing.filter((ts) => ts > nowMs - windowMs);

    if (valid.length === 0 && existing.length > 0) {
      this.hits.delete(key);
    }

    if (valid.length >= limit) {
      const oldest = valid[0]!;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - nowMs) / 1000),
      );
      this.hits.set(key, valid);
      return { allowed: false, retryAfterSeconds };
    }

    valid.push(nowMs);
    this.hits.set(key, valid);
    return { allowed: true };
  }

  private cleanup(nowMs: number): void {
    const cutoff = nowMs - this.options.windowMs;
    for (const [key, timestamps] of this.hits.entries()) {
      if (
        timestamps.length === 0 ||
        timestamps[timestamps.length - 1]! <= cutoff
      ) {
        this.hits.delete(key);
      }
    }
  }
}

