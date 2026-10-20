import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ApiException } from '../common/apiException.js';
import {
  type AuthSessionResponse,
  toAuthSessionResponse,
} from '../auth/dto/authSessionResponse.dto.js';
import { User } from '../auth/entities/user.entity.js';
import { PasswordConfirmation } from '../auth/passwordConfirmation.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { Clock } from '../auth/clock.js';
import { LockedUsersRepository } from '../auth/repositories/lockedUsers.js';
import { SessionIssuer } from '../auth/sessionIssuer.js';
import { SessionsRepository } from '../auth/repositories/sessionsRepository.js';
import { isUsableUser } from '../auth/repositories/usersRepository.js';
import { hashSessionToken } from '../auth/authTokens.js';
import { UserEvents } from './events/userEvents.js';
import { isSameAsEmail, passwordSameAsEmail } from './passwordRules.js';
import type { ChangeMyPasswordDto } from './dto/changeMyPassword.dto.js';
import { MY_PASSWORD_CONFIRMATION } from './tokens.js';

export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string | null;
}

export interface ChangeMyPasswordInput {
  userId: string;
  currentToken: string;
  dto: ChangeMyPasswordDto;
  context: RequestContext;
}

export interface ChangeMyPasswordResult {
  body: AuthSessionResponse;
  token: string;
  maxAgeMs: number;
}

class PasswordHashChangedError extends Error {
  constructor() {
    super('Password hash changed concurrently');
  }
}

@Injectable()
export class MyPasswordService {
  private readonly logger = new Logger(MyPasswordService.name);

  constructor(
    @Inject(MY_PASSWORD_CONFIRMATION)
    private readonly confirmation: PasswordConfirmation,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
    private readonly lockedUsers: LockedUsersRepository,
    private readonly sessionIssuer: SessionIssuer,
    private readonly sessions: SessionsRepository,
    private readonly events: UserEvents,
  ) {}

  async change(input: ChangeMyPasswordInput): Promise<ChangeMyPasswordResult> {
    // Step 1: Reject identical current and new passwords without hashing or consuming rate limit
    if (input.dto.newPassword === input.dto.currentPassword) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        { key: 'errors:checkHighlightedFields' },
        {
          fields: {
            newPassword: { key: 'users:errors.passwordSameAsCurrent' },
          },
        },
      );
    }

    const currentTokenHash = hashSessionToken(input.currentToken);

    // Steps 2-13, with up to one retry from step 2 if the hash changed concurrently (DB B3 step 8)
    for (let attempt = 1; attempt <= 2; attempt++) {
      // Step 2: Verify current password via PasswordConfirmation
      const confirmation = await this.confirmation.confirm(
        input.userId,
        input.dto.currentPassword,
        input.context.requestId,
        {
          stillSignedIn: async () => {
            const active = await this.sessions.findActive(
              currentTokenHash,
              this.clock.now(),
            );
            return active !== null && active.session.userId === input.userId;
          },
        },
      );

      if (confirmation.status === 'no-user') {
        this.logger.warn(
          `users.me.password.refused reason=unusable userId=${input.userId} requestId=${input.context.requestId}`,
        );
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });
      }

      if (confirmation.status === 'not-signed-in') {
        this.logger.warn(
          `users.me.password.refused reason=session_ended userId=${input.userId} requestId=${input.context.requestId}`,
        );
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });
      }

      const verifiedHash = confirmation.verifiedHash;

      // Step 3: Hash new password
      const newPasswordHash = await this.hasher.hash(input.dto.newPassword);

      // Step 4: Prepare new session
      const now = this.clock.now();
      const issued = this.sessionIssuer.issue({
        userId: input.userId,
        now,
        resetOnly: false,
        ip: input.context.ip,
        userAgent: input.context.userAgent,
      });

      // Steps 5-13 inside locked transaction
      try {
        const result = await this.lockedUsers.withLockedUsers(
          [input.userId],
          async (locked) => {
            const row = locked.rows.get(input.userId);

            // Step 6: Usable user check on locked row
            if (!row || !isUsableUser(row)) {
              this.logger.warn(
                `users.me.password.refused reason=unusable userId=${input.userId} requestId=${input.context.requestId}`,
              );
              throw new ApiException(
                HttpStatus.UNAUTHORIZED,
                'UNAUTHENTICATED',
                { key: 'errors:http.unauthenticated' },
              );
            }

            // Step 7: Current session still live
            const currentSession = await locked.writes.findLiveSession(
              input.userId,
              currentTokenHash,
              now,
            );
            if (currentSession === null) {
              this.logger.warn(
                `users.me.password.refused reason=session_ended userId=${input.userId} requestId=${input.context.requestId}`,
              );
              throw new ApiException(
                HttpStatus.UNAUTHORIZED,
                'UNAUTHENTICATED',
                { key: 'errors:http.unauthenticated' },
              );
            }

            // Step 8: Password hash unchanged
            if (row.password !== verifiedHash) {
              if (attempt === 1) {
                throw new PasswordHashChangedError();
              }
              this.logger.warn(
                `users.me.password.refused reason=hash_changed userId=${input.userId} requestId=${input.context.requestId}`,
              );
              throw new ApiException(
                HttpStatus.CONFLICT,
                'PASSWORD_CHANGED_ELSEWHERE',
                { key: 'users:errors.passwordChangedElsewhere' },
              );
            }

            // Step 9: Not same as email
            if (isSameAsEmail(input.dto.newPassword, row.email)) {
              throw passwordSameAsEmail('newPassword');
            }

            // Step 10: Update user row
            await locked.writes.updateUser(input.userId, {
              password: newPasswordHash,
              isPasswordAutoset: false,
              isPasswordExpired: false,
              isPasswordResetRequired: false,
              updatedAt: now,
            });

            // Step 11: Revoke all existing sessions
            const revokedSessionCount = await locked.writes.revokeAllSessions(
              input.userId,
              now,
            );

            // Step 12: Insert new session
            await locked.writes.insertSession(issued.record);

            const updatedUser = Object.assign(new User(), row, {
              password: newPasswordHash,
              isPasswordAutoset: false,
              isPasswordExpired: false,
              isPasswordResetRequired: false,
              updatedAt: now,
            });

            return { updatedUser, revokedSessionCount };
          },
          (retryAttempt) => {
            this.logger.warn(
              `users.me.password.lock.retry userId=${input.userId} attempt=${retryAttempt}`,
            );
          },
        );

        // Step 13 / Post-commit: Dispatch event
        try {
          await this.events.passwordChanged({
            userId: input.userId,
            actorId: input.userId,
            revokedSessionCount: result.revokedSessionCount,
            occurredAt: now,
            requestId: input.context.requestId,
          });
        } catch (error) {
          this.logger.error(
            `user.password_changed event failed userId=${input.userId} requestId=${input.context.requestId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }

        return {
          body: toAuthSessionResponse(result.updatedUser, false),
          token: issued.token,
          maxAgeMs: issued.maxAgeMs,
        };
      } catch (error) {
        if (error instanceof PasswordHashChangedError && attempt === 1) {
          continue;
        }
        throw error;
      }
    }

    // Unreachable due to loop conditions and throws
    throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', {
      key: 'errors:http.internalError',
    });
  }
}
