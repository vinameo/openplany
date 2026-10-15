import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../auth/clock.js';
import { createActorRateLimitGuard } from '../common/actorRateLimitGuard.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import {
  ADMIN_USERS_READ_LIMITER,
  ADMIN_USERS_WRITE_LIMITER,
} from './tokens.js';

@Injectable()
export class AdminUsersReadRateLimitGuard extends createActorRateLimitGuard({
  limiterToken: ADMIN_USERS_READ_LIMITER,
  messageKey: 'admin:errors.tooManyRequests',
  logLabel: 'admin.users.rate_limited limiter=read',
}) {
  constructor(
    @Inject(ADMIN_USERS_READ_LIMITER) limiter: SlidingWindowLimiter,
    clock: Clock,
  ) {
    super(limiter, clock);
  }
}

@Injectable()
export class AdminUsersWriteRateLimitGuard extends createActorRateLimitGuard({
  limiterToken: ADMIN_USERS_WRITE_LIMITER,
  messageKey: 'admin:errors.tooManyUserChanges',
  logLabel: 'admin.users.rate_limited limiter=write',
}) {
  constructor(
    @Inject(ADMIN_USERS_WRITE_LIMITER) limiter: SlidingWindowLimiter,
    clock: Clock,
  ) {
    super(limiter, clock);
  }
}
