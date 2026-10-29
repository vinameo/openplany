import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import {
  ROLE_CHANGE_PREVIEW_ALERT_LIMITER,
  ROLE_CHANGE_PREVIEW_LIMITER,
} from '../tokens.js';

@Injectable()
export class RoleChangePreviewRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RoleChangePreviewRateLimitGuard.name);

  constructor(
    @Inject(ROLE_CHANGE_PREVIEW_LIMITER)
    private readonly limiter: SlidingWindowLimiter,
    @Inject(ROLE_CHANGE_PREVIEW_ALERT_LIMITER)
    private readonly alertLimiter: SlidingWindowLimiter,
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

    const now = this.clock.now();
    const decision = this.limiter.hit(userId, now);
    if (!decision.allowed) {
      if (this.alertLimiter.hit(userId, now).allowed) {
        this.logger.warn(
          `workspace.members.role_preview.rate_limited userId=${userId} requestId=${request.requestId ?? ''}`,
        );
      }
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        { key: 'errors:tooManyAttempts' },
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    return true;
  }
}
