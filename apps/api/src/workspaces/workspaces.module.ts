import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { NoStoreMiddleware } from '../auth/noStore.middleware.js';
import { Workspace } from './entities/workspace.entity.js';
import { WorkspaceMember } from './entities/workspaceMember.entity.js';
import { TypeOrmWorkspacesRepository } from './repositories/typeOrmWorkspaces.repository.js';
import { WorkspacesRepository } from './repositories/workspaces.repository.js';
import {
  InMemorySlugCheckRateLimiter,
  SlugCheckRateLimiter,
} from './slugCheckRateLimiter.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Workspace, WorkspaceMember]),
  ],
  controllers: [WorkspacesController],
  providers: [
    WorkspacesService,
    WorkspaceMemberGuard,
    {
      provide: WorkspacesRepository,
      useClass: TypeOrmWorkspacesRepository,
    },
    {
      provide: SlugCheckRateLimiter,
      useClass: InMemorySlugCheckRateLimiter,
    },
  ],
  exports: [WorkspacesService, WorkspacesRepository, WorkspaceMemberGuard],
})
export class WorkspacesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(NoStoreMiddleware).forRoutes(WorkspacesController);
  }
}

