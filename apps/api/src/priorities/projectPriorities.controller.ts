import { Controller, Get, UseGuards } from '@nestjs/common';
import type { PriorityListResponse } from '@repo/contracts';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import {
  CurrentProject,
  ProjectRead,
} from '../projects/access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../projects/access/projectAccessGuard.js';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { PrioritiesService } from './priorities.service.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ProjectPrioritiesController {
  constructor(private readonly service: PrioritiesService) {}

  @Get(`projects/:${PROJECT_ROUTE_PARAM}/priorities`)
  @ProjectRead('project.workitems.view')
  async list(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
  ): Promise<PriorityListResponse> {
    return this.service.listForProject({
      workspaceId: ws.id,
      projectId: project.project.id,
    });
  }
}
