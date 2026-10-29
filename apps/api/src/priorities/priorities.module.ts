import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { WorkItemPriority } from './entities/workItemPriority.entity.js';
import { PrioritiesService } from './priorities.service.js';
import { PriorityCatalog, TypeOrmPriorityCatalog } from './priorityCatalog.js';
import { ProjectPrioritiesController } from './projectPriorities.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkItemPriority]),
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
  ],
  controllers: [ProjectPrioritiesController],
  providers: [
    PrioritiesService,
    {
      provide: PriorityCatalog,
      useClass: TypeOrmPriorityCatalog,
    },
  ],
  exports: [PriorityCatalog, PrioritiesService, TypeOrmModule],
})
export class PrioritiesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(ProjectPrioritiesController);
  }
}
