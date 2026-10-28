import { Controller, Get, UseGuards } from '@nestjs/common';
import type { StateListResponse } from '@repo/contracts';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import {
  CurrentProject,
  ProjectRead,
} from '../projects/access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../projects/access/projectAccessGuard.js';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { StatesService } from './states.service.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ProjectStatesController {
  constructor(private readonly service: StatesService) {}

  @Get(`projects/:${PROJECT_ROUTE_PARAM}/states`)
  @ProjectRead('project.states.view')
  async list(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
  ): Promise<StateListResponse> {
    const canManage = project.access.permissions.includes('project.states.manage');
    return this.service.listForProject({
      workspaceId: ws.id,
      projectId: project.project.id,
      canManage,
    });
  }
}
