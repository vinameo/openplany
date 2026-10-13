import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { MEMBER_MESSAGES } from '@repo/contracts';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import {
  MEMBER_CANDIDATE_ALERT_LIMITER,
  MEMBER_CANDIDATE_LIMITER,
} from '../tokens.js';

@Injectable()
export class MemberCandidateRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(MemberCandidateRateLimitGuard.name);

  constructor(
    @Inject(MEMBER_CANDIDATE_LIMITER)
    private readonly limiter: SlidingWindowLimiter,
    @Inject(MEMBER_CANDIDATE_ALERT_LIMITER)
    private readonly alertLimiter: SlidingWindowLimiter,
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

    const now = this.clock.now();
    const decision = this.limiter.hit(userId, now);
    if (!decision.allowed) {
      if (this.alertLimiter.hit(userId, now).allowed) {
        this.logger.warn(
          `workspace.members.candidates.rate_limited userId=${userId} requestId=${request.requestId ?? ''}`,
        );
      }
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        MEMBER_MESSAGES.tooManySearches,
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    return true;
  }
}

