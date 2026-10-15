import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../auth/clock.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import { retryAfterMinutes } from '../common/actorRateLimitGuard.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { ADMIN_REAUTH_FAILURE_LIMITER } from './tokens.js';

/** Wrong passwords per actor per window before 429 (API B2.2). */
export const REAUTH_FAILURE_LIMIT = 5;
export const REAUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;

const REAUTHENTICATION_FAILED_REF = {
  key: 'admin:users.errors.reauthenticationFailed',
} as const;

/**
 * Step-up re-authentication (API B7, A07): the acting admin proves it is
 * them by typing their own password, so a stolen session alone cannot take
 * over other instance admins. Only wrong passwords count toward the limit,
 * so a cookie thief gets REAUTH_FAILURE_LIMIT guesses per window.
 */
@Injectable()
export class ActorReauthentication {
  private readonly logger = new Logger(ActorReauthentication.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    @Inject(ADMIN_REAUTH_FAILURE_LIMITER)
    private readonly failures: SlidingWindowLimiter,
    private readonly clock: Clock,
  ) {}

  /**
   * Checks `password` against the actor's stored hash and returns that hash.
   * The caller compares it with the actor row it locks for the write, so a
   * password changed in between does not pass (as sign-in does, BA ADR-07).
   * null: no active actor; the locked-row check answers 403 FORBIDDEN.
   */
  async verify(
    actorId: string,
    password: string,
    requestId: string,
  ): Promise<string | null> {
    const now = this.clock.now();
    const limit = this.failures.peek(actorId, now);
    if (!limit.allowed) {
      if (limit.firstBlockInWindow) {
        this.logger.warn(
          `admin.users.rate_limited limiter=reauth userId=${actorId} requestId=${requestId}`,
        );
      }
      const retryAfterSeconds = limit.retryAfterSeconds ?? 60;
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_REAUTH_ATTEMPTS',
        {
          key: 'admin:users.errors.tooManyReauthAttempts',
          params: { count: retryAfterMinutes(retryAfterSeconds) },
        },
        { retryAfterSeconds },
      );
    }

    const actor = await this.users.findActiveById(actorId);
    if (actor === null) return null;

    const verification = await this.hasher.verify(actor.password, password);
    if (!verification.ok) {
      this.failures.hit(actorId, now);
      this.logger.warn(
        `admin.users.reauth_failed userId=${actorId} requestId=${requestId}`,
      );
      throw reauthenticationFailed();
    }
    return actor.password;
  }
}

/** 403 for a wrong actor password, or one that changed before the lock. */
export function reauthenticationFailed(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    'REAUTHENTICATION_FAILED',
    REAUTHENTICATION_FAILED_REF,
    { fields: { actorPassword: REAUTHENTICATION_FAILED_REF } },
  );
}
