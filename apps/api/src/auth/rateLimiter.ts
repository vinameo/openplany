import { Injectable } from '@nestjs/common';
import { Clock } from './clock.js';
import { LoginAttemptsRepository } from './repositories/loginAttemptsRepository.js';

export type RateLimitDecision =
  | { blocked: true; retryAfterSeconds: number }
  | { blocked: false; delayMs: number };

export interface RateLimitKey {
  ip: string;
  emailHash: string;
}

export abstract class LoginRateLimiter {
  abstract check(key: RateLimitKey): Promise<RateLimitDecision>;
}

// api-spec 6.2. Only `failure` rows count; `blocked` rows never do.
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const IP_FAILURE_LIMIT = 50;
export const EMAIL_IP_FAILURE_LIMIT = 5;
/** Per email across all IPs: slow down instead of locking (no lockout DoS). */
export const EMAIL_SLOWDOWN_THRESHOLD = 20;
export const MAX_SLOWDOWN_MS = 5000;

/** Counts failures in login_attempts over a sliding 15-minute window. */
@Injectable()
export class DbLoginRateLimiter extends LoginRateLimiter {
  constructor(
    private readonly attempts: LoginAttemptsRepository,
    private readonly clock: Clock,
  ) {
    super();
  }

  async check({ ip, emailHash }: RateLimitKey): Promise<RateLimitDecision> {
    const now = this.clock.now();
    const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    const [ipLimitHitAt, emailIpLimitHitAt, emailFailures] = await Promise.all([
      this.attempts.nthRecentFailureAt({ ip }, since, IP_FAILURE_LIMIT),
      this.attempts.nthRecentFailureAt(
        { ip, emailHash },
        since,
        EMAIL_IP_FAILURE_LIMIT,
      ),
      this.attempts.countEmailFailures(emailHash, since),
    ]);

    // Locked until the oldest failure that keeps the count at the limit
    // slides out of the window.
    const lockedUntil = [ipLimitHitAt, emailIpLimitHitAt]
      .filter((at): at is Date => at !== null)
      .map((at) => at.getTime() + RATE_LIMIT_WINDOW_MS)
      .reduce((latest, until) => Math.max(latest, until), 0);
    if (lockedUntil > now.getTime()) {
      return {
        blocked: true,
        retryAfterSeconds: Math.ceil((lockedUntil - now.getTime()) / 1000),
      };
    }

    const overSlowdown = emailFailures - EMAIL_SLOWDOWN_THRESHOLD + 1;
    return {
      blocked: false,
      delayMs:
        overSlowdown > 0 ? Math.min(overSlowdown * 1000, MAX_SLOWDOWN_MS) : 0,
    };
  }
}
