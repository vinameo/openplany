import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../auth/clock.js';
import { createActorRateLimitGuard } from '../../common/actorRateLimitGuard.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { ROLE_PERMISSIONS_WRITE_LIMITER } from './tokens.js';

@Injectable()
export class RolePermissionsWriteRateLimitGuard extends createActorRateLimitGuard(
  {
    limiterToken: ROLE_PERMISSIONS_WRITE_LIMITER,
    messageKey: 'errors:tooManyRolePermissionUpdates',
    logLabel: 'admin.role_permissions.rate_limited',
  },
) {
  constructor(
    @Inject(ROLE_PERMISSIONS_WRITE_LIMITER) limiter: SlidingWindowLimiter,
    clock: Clock,
  ) {
    super(limiter, clock);
  }
}
