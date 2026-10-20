import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../auth/clock.js';
import { createActorRateLimitGuard } from '../common/actorRateLimitGuard.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { MY_PASSWORD_CHANGE_LIMITER } from './tokens.js';

@Injectable()
export class MyPasswordChangeRateLimitGuard extends createActorRateLimitGuard({
  limiterToken: MY_PASSWORD_CHANGE_LIMITER,
  messageKey: 'users:errors.tooManyPasswordChanges',
  code: 'TOO_MANY_PASSWORD_CHANGES',
  formatLog: ({ userId, requestId }) =>
    `users.me.password.rate_limited limiter=changes userId=${userId} requestId=${requestId}`,
}) {
  constructor(
    @Inject(MY_PASSWORD_CHANGE_LIMITER) limiter: SlidingWindowLimiter,
    clock: Clock,
  ) {
    super(limiter, clock);
  }
}
