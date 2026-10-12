import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateProjectResponse,
  ProjectListResponse,
  ProjectResponse,
} from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { WorkspaceWrite } from '../workspaces/workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../workspaces/workspaceMemberGuard.js';
import {
  CurrentProject,
  ProjectRead,
} from './access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from './access/projectAccessGuard.js';
import type { AccessibleProject } from './access/projectAccessResolver.js';
import { CreateProjectDto } from './dto/createProject.dto.js';
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

  @Get(`projects/:${PROJECT_ROUTE_PARAM}`)
  @ProjectRead()
  get(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
  ): Promise<ProjectResponse> {
    return this.service.get(ws, project);
  }

  @Post('projects')
  @WorkspaceWrite('workspace.projects.create')
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Body() dto: CreateProjectDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<CreateProjectResponse> {
    return this.service.create(ws, userId, dto, req.requestId);
  }
}
