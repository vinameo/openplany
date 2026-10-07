import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Clock, SystemClock } from './clock.js';
import { LoginAttempt } from './entities/loginAttempt.entity.js';
import { Session } from './entities/session.entity.js';
import { User } from './entities/user.entity.js';
import { OriginGuard } from './guards/originGuard.js';
import { NoStoreMiddleware } from './noStore.middleware.js';
import { Argon2PasswordHasher, PasswordHasher } from './passwordHasher.js';
import { DbLoginRateLimiter, LoginRateLimiter } from './rateLimiter.js';
import {
  LoginAttemptsRepository,
  TypeOrmLoginAttemptsRepository,
} from './repositories/loginAttemptsRepository.js';
import {
  SessionsRepository,
  TypeOrmSessionsRepository,
} from './repositories/sessionsRepository.js';
import {
  TypeOrmUsersRepository,
  UsersRepository,
} from './repositories/usersRepository.js';
import { SessionCookie } from './sessionCookie.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, LoginAttempt])],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionCookie,
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: Clock, useClass: SystemClock },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: LoginRateLimiter, useClass: DbLoginRateLimiter },
    { provide: UsersRepository, useClass: TypeOrmUsersRepository },
    { provide: SessionsRepository, useClass: TypeOrmSessionsRepository },
    {
      provide: LoginAttemptsRepository,
      useClass: TypeOrmLoginAttemptsRepository,
    },
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(AuthController);
  }
}
