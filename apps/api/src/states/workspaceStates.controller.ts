import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { StateListResponse, StateMutationResponse } from '@repo/contracts';
import type { Request } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import {
  WorkspaceRead,
  WorkspaceWrite,
} from '../workspaces/workspaceAccess.decorator.js';
import { CreateStateDto } from './dto/createState.dto.js';
import { DeleteStateQueryDto } from './dto/deleteStateQuery.dto.js';
import { UpdateStateDto } from './dto/updateState.dto.js';
import { StatesService } from './states.service.js';
import { STATE_WRITE_LIMIT } from './tokens.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class WorkspaceStatesController {
  constructor(private readonly service: StatesService) {}

  @Get('states')
  @WorkspaceRead('workspace.settings.view')
  async list(
    @CurrentWorkspace() ws: MemberWorkspace,
  ): Promise<StateListResponse> {
    const canManage = ws.permissions.includes('workspace.states.manage');
    return this.service.listForWorkspace({
      workspaceId: ws.id,
      canManage,
    });
  }

  @Post('states')
  @WorkspaceWrite('workspace.states.manage', { writeLimit: STATE_WRITE_LIMIT })
  async create(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Body() dto: CreateStateDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<StateMutationResponse> {
    return this.service.create({
      scope: {
        level: 'workspace',
        workspaceId: ws.id,
      },
      actorId: userId,
      dto,
      requestId: req.requestId,
    });
  }

  @Patch('states/:stateId')
  @WorkspaceWrite('workspace.states.manage', { writeLimit: STATE_WRITE_LIMIT })
  async update(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Param('stateId') stateId: string,
    @Body() dto: UpdateStateDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<StateMutationResponse> {
    return this.service.update({
      scope: {
        level: 'workspace',
        workspaceId: ws.id,
      },
      actorId: userId,
      stateId,
      dto,
      requestId: req.requestId,
    });
  }

  @Delete('states/:stateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @WorkspaceWrite('workspace.states.manage', { writeLimit: STATE_WRITE_LIMIT })
  async remove(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Param('stateId') stateId: string,
    @Query() query: DeleteStateQueryDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<void> {
    await this.service.remove({
      scope: {
        level: 'workspace',
        workspaceId: ws.id,
      },
      actorId: userId,
      stateId,
      replacementStateId: query.replacementStateId,
      requestId: req.requestId,
    });
  }
}
