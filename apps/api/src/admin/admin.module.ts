import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { User } from '../auth/entities/user.entity.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import {
  ActorReauthentication,
  REAUTH_FAILURE_LIMIT,
  REAUTH_FAILURE_WINDOW_MS,
} from './actorReauthentication.js';
import { AdminUsersController } from './adminUsers.controller.js';
import { AdminUsersService } from './adminUsers.service.js';
import { LoggingUserEvents } from './events/loggingUserEvents.js';
import { UserEvents } from './events/userEvents.js';
import { InstanceAdminGuard } from './instanceAdminGuard.js';
import {
  AdminUsersRepository,
  TypeOrmAdminUsersRepository,
} from './repositories/adminUsersRepository.js';
import { AdminRolesController } from './roles/adminRoles.controller.js';
import { AdminRolesService } from './roles/adminRoles.service.js';
import { RolePermissionsRepository } from './roles/repositories/rolePermissionsRepository.js';
import { TypeOrmRolePermissionsRepository } from './roles/repositories/typeOrmRolePermissions.repository.js';
import { RolePermissionsWriteRateLimitGuard } from './roles/rolePermissionsWriteRateLimitGuard.js';
import { ROLE_PERMISSIONS_WRITE_LIMITER } from './roles/tokens.js';
import {
  ADMIN_REAUTH_FAILURE_LIMITER,
  ADMIN_USERS_READ_LIMITER,
  ADMIN_USERS_WRITE_LIMITER,
  USER_CREATE_LIMITER,
} from './tokens.js';
import {
  AdminUsersReadRateLimitGuard,
  AdminUsersWriteRateLimitGuard,
} from './adminUsersRateLimitGuards.js';
import { Permission } from '../roles/entities/permission.entity.js';
import { Role } from '../roles/entities/role.entity.js';
import { RolePermission } from '../roles/entities/rolePermission.entity.js';
import { RolePermissionHistory } from '../roles/entities/rolePermissionHistory.entity.js';
import { UserCreateRateLimitGuard } from './userCreateRateLimitGuard.js';

import { RolesModule } from '../roles/roles.module.js';

@Module({
  imports: [
    AuthModule,
    RolesModule,
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      RolePermission,
      RolePermissionHistory,
    ]),
  ],
  controllers: [AdminUsersController, AdminRolesController],
  providers: [
    AdminUsersService,
    ActorReauthentication,
    AdminRolesService,
    InstanceAdminGuard,
    UserCreateRateLimitGuard,
    RolePermissionsWriteRateLimitGuard,
    AdminUsersReadRateLimitGuard,
    AdminUsersWriteRateLimitGuard,
    {
      provide: USER_CREATE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 20, windowMs: 600_000 }),
    },
    {
      provide: ADMIN_USERS_READ_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 120, windowMs: 60_000 }),
    },
    {
      provide: ADMIN_USERS_WRITE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 60, windowMs: 600_000 }),
    },
    {
      provide: ADMIN_REAUTH_FAILURE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({
          limit: REAUTH_FAILURE_LIMIT,
          windowMs: REAUTH_FAILURE_WINDOW_MS,
        }),
    },
    {
      provide: ROLE_PERMISSIONS_WRITE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 30, windowMs: 600_000 }),
    },
    { provide: AdminUsersRepository, useClass: TypeOrmAdminUsersRepository },
    {
      provide: RolePermissionsRepository,
      useClass: TypeOrmRolePermissionsRepository,
    },
    { provide: UserEvents, useClass: LoggingUserEvents },
  ],
})
export class AdminModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Responses carry administrative or role permission settings that must not be cached
    consumer
      .apply(NoStoreMiddleware)
      .forRoutes(AdminUsersController, AdminRolesController);
  }
}
