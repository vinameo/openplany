import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { AdminUsersController } from './adminUsers.controller.js';
import { AdminUsersService } from './adminUsers.service.js';
import { LoggingUserEvents } from './events/loggingUserEvents.js';
import { UserEvents } from './events/userEvents.js';
import { InstanceAdminGuard } from './instanceAdminGuard.js';
import {
  AdminUsersRepository,
  TypeOrmAdminUsersRepository,
} from './repositories/adminUsersRepository.js';
import { USER_CREATE_LIMITER } from './tokens.js';
import { UserCreateRateLimitGuard } from './userCreateRateLimitGuard.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminUsersController],
  providers: [
    AdminUsersService,
    InstanceAdminGuard,
    UserCreateRateLimitGuard,
    {
      provide: USER_CREATE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 20, windowMs: 600_000 }),
    },
    { provide: AdminUsersRepository, useClass: TypeOrmAdminUsersRepository },
    { provide: UserEvents, useClass: LoggingUserEvents },
  ],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Responses carry personal data.
    consumer.apply(NoStoreMiddleware).forRoutes(AdminUsersController);
  }
}

