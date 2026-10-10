import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { Workspace } from './entities/workspace.entity.js';
import { WorkspaceMember } from './entities/workspaceMember.entity.js';
import { RolePermission } from '../roles/entities/rolePermission.entity.js';
import { LoggingWorkspaceEvents } from './events/loggingWorkspaceEvents.js';
import { WorkspaceEvents } from './events/workspaceEvents.js';
import { TypeOrmWorkspacesRepository } from './repositories/typeOrmWorkspaces.repository.js';
import { WorkspacesRepository } from './repositories/workspaces.repository.js';
import {
  MEMBER_CANDIDATE_LIMITER,
  SLUG_CHECK_LIMITER,
  WORKSPACE_WRITE_LIMITER,
} from './tokens.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from './workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from './workspaceWriteRateLimitGuard.js';
import { MemberCandidateRateLimitGuard } from './members/memberCandidateRateLimitGuard.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';
import { WorkspaceMembersController } from './members/workspaceMembers.controller.js';
import { WorkspaceMembersService } from './members/workspaceMembers.service.js';
import { WorkspaceMembersRepository } from './members/workspaceMembers.repository.js';
import { TypeOrmWorkspaceMembersRepository } from './members/typeOrmWorkspaceMembers.repository.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Workspace, WorkspaceMember, RolePermission]),
  ],
  controllers: [WorkspacesController, WorkspaceMembersController],
  providers: [
    WorkspacesService,
    WorkspaceMembersService,
    WorkspaceMemberGuard,
    WorkspacePermissionGuard,
    WorkspaceWriteRateLimitGuard,
    MemberCandidateRateLimitGuard,
    {
      provide: WorkspacesRepository,
      useClass: TypeOrmWorkspacesRepository,
    },
    {
      provide: WorkspaceMembersRepository,
      useClass: TypeOrmWorkspaceMembersRepository,
    },
    {
      provide: WorkspaceEvents,
      useClass: LoggingWorkspaceEvents,
    },
    {
      provide: SLUG_CHECK_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 60, windowMs: 60_000 }),
    },
    {
      provide: WORKSPACE_WRITE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 30, windowMs: 600_000 }),
    },
    {
      provide: MEMBER_CANDIDATE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 60, windowMs: 60_000 }),
    },
  ],
  exports: [
    WorkspacesService,
    WorkspacesRepository,
    WorkspaceMembersService,
    WorkspaceMembersRepository,
    WorkspaceMemberGuard,
    WorkspacePermissionGuard,
    WorkspaceWriteRateLimitGuard,
    MemberCandidateRateLimitGuard,
  ],
})
export class WorkspacesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(NoStoreMiddleware)
      .forRoutes(WorkspacesController, WorkspaceMembersController);
  }
}
