import { Injectable } from '@nestjs/common';
import { Clock } from './clock.js';
import {
  LoginAttemptsRepository,
  type LockedLoginAttempts,
} from './repositories/loginAttemptsRepository.js';

export type RateLimitDecision =
  | { blocked: true; retryAfterSeconds: number }
  | { blocked: false; delayMs: number; attemptId: string };

export interface PendingLoginAttempt {
  ip: string;
  emailHash: string;
  userAgent: string | null;
}

export abstract class LoginRateLimiter {
  /**
   * Checks the limits and records the attempt in the same locked step, so
   * parallel sign-ins already count it (no check-then-act race):
   * - blocked: a `blocked` row is recorded;
   * - allowed: a provisional `failure` row is recorded and its id returned.
   *   The caller finishes it with LoginAttemptsRepository.finish() or the
   *   sign-in transaction. If the request dies first, it stays a failure.
   */
  abstract reserve(attempt: PendingLoginAttempt): Promise<RateLimitDecision>;
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

  reserve(attempt: PendingLoginAttempt): Promise<RateLimitDecision> {
    return this.attempts.withIpLock(attempt.ip, async (locked) => {
      const decision = await this.decide(locked, attempt);
      if (decision.blocked) {
        await locked.insert({
          ...attempt,
          userId: null,
          result: 'blocked',
          reason: 'rate_limited',
        });
        return decision;
      }
      const attemptId = await locked.insert({
        ...attempt,
        userId: null,
        result: 'failure',
        reason: null,
      });
      return { ...decision, attemptId };
    });
  }

  private async decide(
    locked: LockedLoginAttempts,
    { ip, emailHash }: PendingLoginAttempt,
  ): Promise<
    | { blocked: true; retryAfterSeconds: number }
    | { blocked: false; delayMs: number }
  > {
    const now = this.clock.now();
    const since = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    // Sequential: the queries share the transaction's single connection.
    const ipLimitHitAt = await locked.nthRecentFailureAt(
      { ip },
      since,
      IP_FAILURE_LIMIT,
    );
    const emailIpLimitHitAt = await locked.nthRecentFailureAt(
      { ip, emailHash },
      since,
      EMAIL_IP_FAILURE_LIMIT,
    );
    const emailFailures = await locked.countEmailFailures(emailHash, since);

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
