import { HttpStatus, Logger } from '@nestjs/common';
import type { MessageKey, MessageRef } from '@repo/contracts';
import { retryAfterMinutes } from '../common/actorRateLimitGuard.js';
import { ApiException, type ApiErrorCode } from '../common/apiException.js';
import type { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import type { Clock } from './clock.js';
import type { PasswordHasher } from './passwordHasher.js';
import type { UsersRepository } from './repositories/usersRepository.js';

export interface PasswordConfirmationConfig {
  limiter: SlidingWindowLimiter;
  incorrect: {
    status: HttpStatus;
    code: ApiErrorCode;
    message: MessageRef;
    field: string;
  };
  blocked: {
    code: ApiErrorCode;
    messageKey: MessageKey;
  };
  log: {
    incorrect: (info: { userId: string; requestId: string }) => string;
    blocked: (info: { userId: string; requestId: string }) => string;
  };
}

export type ConfirmationResult =
  | { status: 'ok'; verifiedHash: string }
  | { status: 'no-user' }
  | { status: 'not-signed-in' };

export class PasswordConfirmation {
  private readonly logger = new Logger(PasswordConfirmation.name);

  constructor(
    private readonly config: PasswordConfirmationConfig,
    private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  /**
   * hit (giữ chỗ; hết chỗ → ném blocked) → findActiveById → verify.
   * Đúng → release. Sai → nếu stillSignedIn có và trả false → release, 'not-signed-in';
   * không thì giữ chỗ, log incorrect, ném incorrect.
   */
  async confirm(
    userId: string,
    password: string,
    requestId: string,
    options?: { stillSignedIn?: () => Promise<boolean> },
  ): Promise<ConfirmationResult> {
    const now = this.clock.now();
    const limit = this.config.limiter.hit(userId, now);
    if (!limit.allowed) {
      if (limit.firstBlockInWindow) {
        this.logger.warn(this.config.log.blocked({ userId, requestId }));
      }
      const retryAfterSeconds = limit.retryAfterSeconds ?? 60;
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        this.config.blocked.code,
        {
          key: this.config.blocked.messageKey,
          params: { count: retryAfterMinutes(retryAfterSeconds) },
        },
        { retryAfterSeconds },
      );
    }

    let keepSlot = false;
    try {
      const user = await this.users.findActiveById(userId);
      if (user === null) {
        return { status: 'no-user' };
      }

      const verification = await this.hasher.verify(user.password, password);
      if (verification.ok) {
        return { status: 'ok', verifiedHash: user.password };
      }

      if (options?.stillSignedIn) {
        const still = await options.stillSignedIn();
        if (!still) {
          return { status: 'not-signed-in' };
        }
      }

      keepSlot = true;
      this.logger.warn(this.config.log.incorrect({ userId, requestId }));
      throw new ApiException(
        this.config.incorrect.status,
        this.config.incorrect.code,
        this.config.incorrect.message,
        {
          fields: {
            [this.config.incorrect.field]: this.config.incorrect.message,
          },
        },
      );
    } finally {
      if (!keepSlot) {
        this.config.limiter.release(userId, now);
      }
    }
  }
}
