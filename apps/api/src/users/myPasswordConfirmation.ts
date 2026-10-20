import { HttpStatus } from '@nestjs/common';
import type { PasswordConfirmationOptions } from '../auth/passwordConfirmation.js';

/**
 * Checking the current password on Change password (API B4.1, B2.1): its
 * own failure limit, never shared with the Users page re-authentication.
 */
export const MY_PASSWORD_CONFIRMATION_OPTIONS: PasswordConfirmationOptions = {
  failureLimit: { limit: 5, windowMs: 15 * 60 * 1000 },
  incorrect: {
    status: HttpStatus.BAD_REQUEST,
    code: 'CURRENT_PASSWORD_INCORRECT',
    message: { key: 'users:errors.currentPasswordIncorrect' },
    field: 'currentPassword',
  },
  blocked: {
    code: 'TOO_MANY_PASSWORD_ATTEMPTS',
    messageKey: 'users:errors.tooManyPasswordAttempts',
  },
  log: {
    incorrect: ({ userId, requestId }) =>
      `users.me.password.incorrect userId=${userId} requestId=${requestId}`,
    blocked: ({ userId, requestId }) =>
      `users.me.password.rate_limited limiter=failures userId=${userId} requestId=${requestId}`,
  },
};

/** Every call to PUT /users/me/password, right or wrong (API B2.1, RQ D23). */
export const MY_PASSWORD_CHANGE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };
