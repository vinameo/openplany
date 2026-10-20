export interface SlidingWindowDecision {
  allowed: boolean;
  retryAfterSeconds?: number;
  firstBlockInWindow?: boolean;
}

export abstract class SlidingWindowLimiter {
  /** Records a hit for `key` unless it is already at the limit. */
  abstract hit(key: string, now: Date): SlidingWindowDecision;
  /**
   * The decision `hit` would make, without recording a hit: for limits that
   * count only failures (check first, `hit` when the attempt fails).
   */
  abstract peek(key: string, now: Date): SlidingWindowDecision;
  /**
   * Un-records the hit recorded for `key` at `at`.
   * Does nothing if no matching hit is found.
   */
  abstract release(key: string, at: Date): void;
}

export interface InMemorySlidingWindowLimiterOptions {
  limit: number;
  windowMs: number;
}

export class InMemorySlidingWindowLimiter extends SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly blockedKeys = new Set<string>();
  private hitCounter = 0;

  constructor(private readonly options: InMemorySlidingWindowLimiterOptions) {
    super();
  }

  hit(key: string, now: Date): SlidingWindowDecision {
    return this.decide(key, now, true);
  }

  peek(key: string, now: Date): SlidingWindowDecision {
    return this.decide(key, now, false);
  }

  release(key: string, at: Date): void {
    const existing = this.hits.get(key);
    if (!existing) return;
    const atMs = at.getTime();
    const index = existing.indexOf(atMs);
    if (index === -1) return;
    existing.splice(index, 1);
    if (existing.length === 0) {
      this.hits.delete(key);
      this.blockedKeys.delete(key);
    } else if (existing.length < this.options.limit) {
      this.blockedKeys.delete(key);
    }
  }

  private decide(
    key: string,
    now: Date,
    record: boolean,
  ): SlidingWindowDecision {
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
      this.blockedKeys.delete(key);
    }

    if (valid.length >= limit) {
      const oldest = valid[0]!;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + windowMs - nowMs) / 1000),
      );
      this.hits.set(key, valid);
      const firstBlockInWindow = !this.blockedKeys.has(key);
      if (firstBlockInWindow) {
        this.blockedKeys.add(key);
      }
      return { allowed: false, retryAfterSeconds, firstBlockInWindow };
    }

    if (record) {
      valid.push(nowMs);
    }
    if (valid.length > 0) {
      this.hits.set(key, valid);
    }
    this.blockedKeys.delete(key);
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
        this.blockedKeys.delete(key);
      }
    }
  }
}
