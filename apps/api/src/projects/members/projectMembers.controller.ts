import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type {
  ProjectMemberCandidateListResponse,
  ProjectMemberListResponse,
} from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { MemberCandidateQueryDto } from '../../common/memberCandidateQuery.dto.js';
import { CurrentWorkspace } from '../../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import {
  CurrentProject,
  ProjectMemberCandidateSearch,
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

  @Get(`projects/:${PROJECT_ROUTE_PARAM}/member-candidates`)
  @ProjectMemberCandidateSearch()
  candidates(
    @Query() q: MemberCandidateQueryDto,
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Req() req: Request & { requestId?: string },
  ): Promise<ProjectMemberCandidateListResponse> {
    return this.service.searchCandidates(
      ws,
      project,
      userId,
      q.email,
      req.requestId,
    );
  }
}
