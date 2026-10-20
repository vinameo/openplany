import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { passwordConfirmationProvider } from '../auth/passwordConfirmation.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { UserEventsModule } from './events/userEvents.module.js';
import { MyPasswordChangeRateLimitGuard } from './myPasswordChangeRateLimitGuard.js';
import {
  MY_PASSWORD_CHANGE_LIMIT,
  MY_PASSWORD_CONFIRMATION_OPTIONS,
} from './myPasswordConfirmation.js';
import { MyPasswordService } from './myPassword.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import {
  MY_PASSWORD_CHANGE_LIMITER,
  MY_PASSWORD_CONFIRMATION,
} from './tokens.js';

// Nothing is exported: the Change password limiters belong to this module
// alone, so no other flow can move their counts (RQ INV-03).
@Module({
  imports: [AuthModule, UserEventsModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    MyPasswordService,
    MyPasswordChangeRateLimitGuard,
    {
      provide: MY_PASSWORD_CHANGE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter(MY_PASSWORD_CHANGE_LIMIT),
    },
    passwordConfirmationProvider(
      MY_PASSWORD_CONFIRMATION,
      MY_PASSWORD_CONFIRMATION_OPTIONS,
    ),
  ],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Responses carry personal data.
    consumer.apply(NoStoreMiddleware).forRoutes(ProfileController);
  }
}
