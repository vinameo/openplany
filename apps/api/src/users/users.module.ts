import {
  HttpStatus,
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { Clock } from '../auth/clock.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { PasswordConfirmation } from '../auth/passwordConfirmation.js';
import { PasswordHasher } from '../auth/passwordHasher.js';
import { UsersRepository } from '../auth/repositories/usersRepository.js';
import {
  InMemorySlidingWindowLimiter,
  SlidingWindowLimiter,
} from '../common/slidingWindowLimiter.js';
import { UserEventsModule } from './events/userEvents.module.js';
import { MyPasswordChangeRateLimitGuard } from './myPasswordChangeRateLimitGuard.js';
import { MyPasswordService } from './myPassword.service.js';
import { ProfileController } from './profile.controller.js';
import { ProfileService } from './profile.service.js';
import {
  MY_PASSWORD_CHANGE_LIMITER,
  MY_PASSWORD_CONFIRMATION,
  MY_PASSWORD_FAILURE_LIMITER,
} from './tokens.js';

@Module({
  imports: [AuthModule, UserEventsModule],
  controllers: [ProfileController],
  providers: [
    ProfileService,
    MyPasswordService,
    MyPasswordChangeRateLimitGuard,
    {
      provide: MY_PASSWORD_FAILURE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({
          limit: 5,
          windowMs: 15 * 60 * 1000,
        }),
    },
    {
      provide: MY_PASSWORD_CHANGE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({
          limit: 10,
          windowMs: 10 * 60 * 1000,
        }),
    },
    {
      provide: MY_PASSWORD_CONFIRMATION,
      useFactory: (
        limiter: SlidingWindowLimiter,
        users: UsersRepository,
        hasher: PasswordHasher,
        clock: Clock,
      ) =>
        new PasswordConfirmation(
          {
            limiter,
            incorrect: {
              status: HttpStatus.BAD_REQUEST,
              code: 'CURRENT_PASSWORD_INCORRECT',
              message: { key: 'users:errors.currentPasswordIncorrect' },
              field: 'currentPassword',
            },
            blocked: {
              code: 'TOO_MANY_PASSWORD_ATTEMPTS',
              messageKey: 'users:errors.tooManyPasswordAttempts',
            },
            log: {
              incorrect: ({ userId, requestId }) =>
                `users.me.password.incorrect userId=${userId} requestId=${requestId}`,
              blocked: ({ userId, requestId }) =>
                `users.me.password.rate_limited limiter=failures userId=${userId} requestId=${requestId}`,
            },
          },
          users,
          hasher,
          clock,
        ),
      inject: [
        MY_PASSWORD_FAILURE_LIMITER,
        UsersRepository,
        PasswordHasher,
        Clock,
      ],
    },
  ],
  exports: [
    MyPasswordService,
    MyPasswordChangeRateLimitGuard,
    MY_PASSWORD_CHANGE_LIMITER,
    MY_PASSWORD_FAILURE_LIMITER,
  ],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Responses carry personal data.
    consumer.apply(NoStoreMiddleware).forRoutes(ProfileController);
  }
}
