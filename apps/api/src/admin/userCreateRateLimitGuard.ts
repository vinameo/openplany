import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { USER_CREATE_LIMITER } from './tokens.js';

@Injectable()
export class UserCreateRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(UserCreateRateLimitGuard.name);

  constructor(
    @Inject(USER_CREATE_LIMITER)
    private readonly limiter: SlidingWindowLimiter,
    private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.auth?.userId;

    if (!userId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Sign in to continue',
      );
    }

    const decision = this.limiter.hit(userId, this.clock.now());
    if (!decision.allowed) {
      this.logger.warn(
        `admin.users.rate_limited userId=${userId} requestId=${request.requestId ?? ''}`,
      );
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        'Too many users created. Try again later.',
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    return true;
  }
}

