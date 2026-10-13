import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { User } from '../auth/entities/user.entity.js';
import { RolePermission } from '../roles/entities/rolePermission.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspaceMember.entity.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { ProjectAccessGuard } from './access/projectAccessGuard.js';
import {
  ProjectAccessResolver,
  TypeOrmProjectAccessResolver,
} from './access/projectAccessResolver.js';
import { Project } from './entities/project.entity.js';
import { ProjectMember } from './entities/projectMember.entity.js';
import { ProjectMemberRoleHistory } from './entities/projectMemberRoleHistory.entity.js';
import { LoggingProjectEvents } from './events/loggingProjectEvents.js';
import { ProjectEvents } from './events/projectEvents.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ProjectsRepository } from './repositories/projects.repository.js';
import { TypeOrmProjectsRepository } from './repositories/typeOrmProjects.repository.js';
import { ProjectMembersController } from './members/projectMembers.controller.js';
import { ProjectMembersService } from './members/projectMembers.service.js';
import { ProjectMembersRepository } from './members/projectMembers.repository.js';
import { TypeOrmProjectMembersRepository } from './members/typeOrmProjectMembers.repository.js';
import {
  PROJECT_LOOKUP_ALERT_LIMITER,
  PROJECT_LOOKUP_LIMITER,
} from './tokens.js';

import { RolesModule } from '../roles/roles.module.js';

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    RolesModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectMemberRoleHistory,
      WorkspaceMember,
      User,
      RolePermission,
    ]),
  ],
  controllers: [ProjectsController, ProjectMembersController],
  providers: [
    ProjectsService,
    {
      provide: ProjectsRepository,
      useClass: TypeOrmProjectsRepository,
    },
    ProjectMembersService,
    {
      provide: ProjectMembersRepository,
      useClass: TypeOrmProjectMembersRepository,
    },
    {
      provide: ProjectAccessResolver,
      useClass: TypeOrmProjectAccessResolver,
    },
    {
      provide: ProjectEvents,
      useClass: LoggingProjectEvents,
    },
    {
      provide: PROJECT_LOOKUP_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 30, windowMs: 600_000 }),
    },
    {
      provide: PROJECT_LOOKUP_ALERT_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({ limit: 1, windowMs: 600_000 }),
    },
    ProjectAccessGuard,
  ],
  exports: [
    ProjectsService,
    ProjectsRepository,
    ProjectMembersService,
    ProjectMembersRepository,
    ProjectAccessResolver,
    ProjectAccessGuard,
    ProjectEvents,
    PROJECT_LOOKUP_LIMITER,
    PROJECT_LOOKUP_ALERT_LIMITER,
  ],
})
export class ProjectsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(NoStoreMiddleware)
      .forRoutes(ProjectsController, ProjectMembersController);
  }
}
