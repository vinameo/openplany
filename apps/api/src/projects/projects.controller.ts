import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ProjectListResponse } from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { WorkspaceMemberGuard } from '../workspaces/workspaceMemberGuard.js';
import { ProjectsService } from './projects.service.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Get('projects')
  @UseGuards(WorkspaceMemberGuard)
  list(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Req() req: Request & { requestId?: string },
  ): Promise<ProjectListResponse> {
    return this.service.list(ws, userId, req.requestId);
  }
}
