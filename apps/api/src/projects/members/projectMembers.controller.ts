import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ProjectMemberListResponse } from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from '../../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import {
  CurrentProject,
  ProjectRead,
} from '../access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../access/projectAccessGuard.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { ProjectMembersService } from './projectMembers.service.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class ProjectMembersController {
  constructor(private readonly service: ProjectMembersService) {}

  @Get(`projects/:${PROJECT_ROUTE_PARAM}/members`)
  @ProjectRead('project.members.view')
  list(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Req() req: Request & { requestId?: string },
  ): Promise<ProjectMemberListResponse> {
    return this.service.list(ws, project, userId, req.requestId);
  }
}
