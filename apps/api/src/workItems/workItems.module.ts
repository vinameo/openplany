import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { InMemorySlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { StatesModule } from '../states/states.module.js';
import { PrioritiesModule } from '../priorities/priorities.module.js';
import { WorkItem } from './entities/workItem.entity.js';
import { LoggingWorkItemEvents } from './events/loggingWorkItemEvents.js';
import { WorkItemEvents } from './events/workItemEvents.js';
import { TypeOrmWorkItemsRepository } from './repositories/typeOrmWorkItems.repository.js';
import { WorkItemsRepository } from './repositories/workItems.repository.js';
import { WORK_ITEM_CREATE_LIMITER } from './tokens.js';
import { WorkItemsController } from './workItems.controller.js';
import { WorkItemsService } from './workItems.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkItem]),
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
    StatesModule,
    PrioritiesModule,
  ],
  controllers: [WorkItemsController],
  providers: [
    WorkItemsService,
    {
      provide: WorkItemsRepository,
      useClass: TypeOrmWorkItemsRepository,
    },
    {
      provide: WorkItemEvents,
      useClass: LoggingWorkItemEvents,
    },
    {
      provide: WORK_ITEM_CREATE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({
          windowMs: 10 * 60 * 1000,
          limit: 120,
        }),
    },
  ],
  exports: [WORK_ITEM_CREATE_LIMITER, WorkItemsService],
})
export class WorkItemsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(WorkItemsController);
  }
}
