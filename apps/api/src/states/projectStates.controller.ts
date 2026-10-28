import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { StateListResponse, StateMutationResponse } from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import {
  CurrentProject,
  ProjectRead,
  ProjectWrite,
} from '../projects/access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../projects/access/projectAccessGuard.js';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { CreateStateDto } from './dto/createState.dto.js';
import { UpdateStateDto } from './dto/updateState.dto.js';
import { StatesService } from './states.service.js';
import { STATE_WRITE_LIMIT } from './tokens.js';

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
    const canManage = project.access.permissions.includes(
      'project.states.manage',
    );
    return this.service.listForProject({
      workspaceId: ws.id,
      projectId: project.project.id,
      canManage,
    });
  }

  @Post(`projects/:${PROJECT_ROUTE_PARAM}/states`)
  @ProjectWrite('project.states.manage', { writeLimit: STATE_WRITE_LIMIT })
  async create(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Body() dto: CreateStateDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<StateMutationResponse> {
    return this.service.create({
      scope: {
        level: 'project',
        workspaceId: ws.id,
        projectId: project.project.id,
      },
      actorId: userId,
      dto,
      requestId: req.requestId,
    });
  }

  @Patch(`projects/:${PROJECT_ROUTE_PARAM}/states/:stateId`)
  @ProjectWrite('project.states.manage', { writeLimit: STATE_WRITE_LIMIT })
  async update(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Param('stateId') stateId: string,
    @Body() dto: UpdateStateDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<StateMutationResponse> {
    return this.service.update({
      scope: {
        level: 'project',
        workspaceId: ws.id,
        projectId: project.project.id,
      },
      actorId: userId,
      stateId,
      dto,
      requestId: req.requestId,
    });
  }
}
