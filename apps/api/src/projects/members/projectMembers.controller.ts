import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ADD_PROJECT_MEMBERS_REQUIREMENT,
  type AddProjectMembersResponse,
  type ProjectMemberCandidateListResponse,
  type ProjectMemberListResponse,
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
  ProjectWrite,
} from '../access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../access/projectAccessGuard.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { AddProjectMembersDto } from './dto/addProjectMembers.dto.js';
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

  @Post(`projects/:${PROJECT_ROUTE_PARAM}/members`)
  @ProjectWrite(ADD_PROJECT_MEMBERS_REQUIREMENT)
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Body() dto: AddProjectMembersDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<AddProjectMembersResponse> {
    return this.service.add(ws, project, userId, dto, req.requestId);
  }
}
