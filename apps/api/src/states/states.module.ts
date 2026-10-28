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
import { WorkItemState } from './entities/workItemState.entity.js';
import { ProjectStatesController } from './projectStates.controller.js';
import { StateCatalog, TypeOrmStateCatalog } from './stateCatalog.js';
import { StatesService } from './states.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WorkItemState]),
    AuthModule,
    WorkspacesModule,
    ProjectsModule,
  ],
  controllers: [ProjectStatesController],
  providers: [
    StatesService,
    {
      provide: StateCatalog,
      useClass: TypeOrmStateCatalog,
    },
  ],
  exports: [StateCatalog, StatesService, TypeOrmModule],
})
export class StatesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(ProjectStatesController);
  }
}
