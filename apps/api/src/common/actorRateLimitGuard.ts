import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type InjectionToken,
  Logger,
  type Type,
} from '@nestjs/common';
import type { Request } from 'express';
import type { MessageKey } from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from './apiException.js';
import { SlidingWindowLimiter } from './slidingWindowLimiter.js';

export interface ActorRateLimitGuardOptions {
  limiterToken: InjectionToken;
  messageKey: MessageKey;
  logLabel?: string;
  formatLog?: (info: { userId: string; requestId: string }) => string;
}

export function createActorRateLimitGuard(
  options: ActorRateLimitGuardOptions,
): Type<CanActivate> {
  @Injectable()
  class ParameterizedActorRateLimitGuard implements CanActivate {
    private readonly logger = new Logger(ParameterizedActorRateLimitGuard.name);

    constructor(
      @Inject(options.limiterToken)
      private readonly limiter: SlidingWindowLimiter,
      private readonly clock: Clock,
    ) {}

    canActivate(context: ExecutionContext): boolean {
      const request = context.switchToHttp().getRequest<Request>();
      const userId = request.auth?.userId;

      if (!userId) {
        throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
          key: 'errors:http.unauthenticated',
        });
      }

      const decision = this.limiter.hit(userId, this.clock.now());
      if (!decision.allowed) {
        if (decision.firstBlockInWindow) {
          const requestId = request.requestId ?? '';
          const message = options.formatLog
            ? options.formatLog({ userId, requestId })
            : `${options.logLabel} userId=${userId} requestId=${requestId}`;
          this.logger.warn(message);
        }
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          'TOO_MANY_ATTEMPTS',
          { key: options.messageKey },
          { retryAfterSeconds: decision.retryAfterSeconds },
        );
      }

      return true;
    }
  }

  return ParameterizedActorRateLimitGuard;
}
