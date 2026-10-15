import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../auth/clock.js';
import { createActorRateLimitGuard } from '../common/actorRateLimitGuard.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { USER_CREATE_LIMITER } from './tokens.js';

@Injectable()
export class UserCreateRateLimitGuard extends createActorRateLimitGuard({
  limiterToken: USER_CREATE_LIMITER,
  messageKey: 'errors:tooManyUsersCreatedLater',
  logLabel: 'admin.users.rate_limited',
}) {
  constructor(
    @Inject(USER_CREATE_LIMITER) limiter: SlidingWindowLimiter,
    clock: Clock,
  ) {
    super(limiter, clock);
  }
}
