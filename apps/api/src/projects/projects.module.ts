import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { User } from '../auth/entities/user.entity.js';
import { RolePermission } from '../roles/entities/rolePermission.entity.js';
import { WorkspaceMember } from '../workspaces/entities/workspaceMember.entity.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
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

@Module({
  imports: [
    AuthModule,
    WorkspacesModule,
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectMemberRoleHistory,
      WorkspaceMember,
      User,
      RolePermission,
    ]),
  ],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    {
      provide: ProjectsRepository,
      useClass: TypeOrmProjectsRepository,
    },
    {
      provide: ProjectAccessResolver,
      useClass: TypeOrmProjectAccessResolver,
    },
    {
      provide: ProjectEvents,
      useClass: LoggingProjectEvents,
    },
  ],
  exports: [ProjectsService, ProjectsRepository, ProjectAccessResolver],
})
export class ProjectsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(ProjectsController);
  }
}
