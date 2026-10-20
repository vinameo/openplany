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
import { ApiException, type ApiErrorCode } from './apiException.js';
import { SlidingWindowLimiter } from './slidingWindowLimiter.js';

/** Whole minutes to wait, as rate-limit sentences show it (`{{count}}`). */
export function retryAfterMinutes(retryAfterSeconds: number): number {
  return Math.max(1, Math.ceil(retryAfterSeconds / 60));
}

export interface ActorRateLimitGuardOptions {
  limiterToken: InjectionToken;
  messageKey: MessageKey;
  code?: ApiErrorCode;
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
        const retryAfterSeconds = decision.retryAfterSeconds ?? 60;
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          options.code ?? 'TOO_MANY_ATTEMPTS',
          {
            key: options.messageKey,
            params: { count: retryAfterMinutes(retryAfterSeconds) },
          },
          { retryAfterSeconds },
        );
      }

      return true;
    }
  }

  return ParameterizedActorRateLimitGuard;
}
