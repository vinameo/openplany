import { HttpStatus } from '@nestjs/common';
import type { PasswordConfirmationOptions } from '../auth/passwordConfirmation.js';
import { ApiException } from '../common/apiException.js';

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
export const ADMIN_REAUTH_CONFIRMATION_OPTIONS: PasswordConfirmationOptions = {
  failureLimit: {
    limit: REAUTH_FAILURE_LIMIT,
    windowMs: REAUTH_FAILURE_WINDOW_MS,
  },
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
};

/** 403 for a wrong actor password, or one that changed before the lock. */
export function reauthenticationFailed(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    'REAUTHENTICATION_FAILED',
    REAUTHENTICATION_FAILED_REF,
    { fields: { actorPassword: REAUTHENTICATION_FAILED_REF } },
  );
}
