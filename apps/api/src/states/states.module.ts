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
import { WorkItemState } from './entities/workItemState.entity.js';
import { ProjectStatesController } from './projectStates.controller.js';
import { WorkspaceStatesController } from './workspaceStates.controller.js';
import { StatesRepository } from './repositories/states.repository.js';
import { TypeOrmStatesRepository } from './repositories/typeOrmStates.repository.js';
import { StateCatalog, TypeOrmStateCatalog } from './stateCatalog.js';
import { LoggingStateEvents, StateEvents } from './stateEvents.js';
import { StatesService } from './states.service.js';
import { STATE_WRITE_LIMITER } from './tokens.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkItemState]),
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
  ],
  controllers: [WorkspaceStatesController, ProjectStatesController],
  providers: [
    StatesService,
    {
      provide: StateCatalog,
      useClass: TypeOrmStateCatalog,
    },
    {
      provide: StatesRepository,
      useClass: TypeOrmStatesRepository,
    },
    {
      provide: StateEvents,
      useClass: LoggingStateEvents,
    },
    {
      provide: STATE_WRITE_LIMITER,
      useFactory: () =>
        new InMemorySlidingWindowLimiter({
          windowMs: 10 * 60 * 1000,
          limit: 60,
        }),
    },
  ],
  exports: [
    StateCatalog,
    StatesService,
    StatesRepository,
    StateEvents,
    STATE_WRITE_LIMITER,
    TypeOrmModule,
  ],
})
export class StatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(NoStoreMiddleware)
      .forRoutes(WorkspaceStatesController, ProjectStatesController);
  }
}
