import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Clock } from '../auth/clock.js';
import { PasswordConfirmation } from '../auth/passwordConfirmation.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { ADMIN_REAUTH_FAILURE_LIMITER } from './tokens.js';

/** Wrong passwords per actor per window before 429 (API B2.2). */
export const REAUTH_FAILURE_LIMIT = 5;
export const REAUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;

export const REAUTHENTICATION_FAILED_REF = {
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
  private readonly confirmation: PasswordConfirmation;

  constructor(
    users: UsersRepository,
    hasher: PasswordHasher,
    @Inject(ADMIN_REAUTH_FAILURE_LIMITER)
    failures: SlidingWindowLimiter,
    clock: Clock,
  ) {
    this.confirmation = new PasswordConfirmation(
      {
        limiter: failures,
        incorrect: {
          status: HttpStatus.FORBIDDEN,
          code: 'REAUTHENTICATION_FAILED',
          message: REAUTHENTICATION_FAILED_REF,
          field: 'actorPassword',
        },
        blocked: {
          code: 'TOO_MANY_REAUTH_ATTEMPTS',
          messageKey: 'admin:users.errors.tooManyReauthAttempts',
        },
        log: {
          incorrect: ({ userId, requestId }) =>
            `admin.users.reauth_failed userId=${userId} requestId=${requestId}`,
          blocked: ({ userId, requestId }) =>
            `admin.users.rate_limited limiter=reauth userId=${userId} requestId=${requestId}`,
        },
      },
      users,
      hasher,
      clock,
    );
  }

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
    const result = await this.confirmation.confirm(actorId, password, requestId);
    if (result.status === 'ok') {
      return result.verifiedHash;
    }
    return null;
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
