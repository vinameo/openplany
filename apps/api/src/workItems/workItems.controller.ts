import {
  Body,
  Controller,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CreateWorkItemResponse } from '@repo/contracts';
import type { Request, Response } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from '../workspaces/currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import {
  CurrentProject,
  ProjectWrite,
} from '../projects/access/projectAccess.decorator.js';
import { PROJECT_ROUTE_PARAM } from '../projects/access/projectAccessGuard.js';
import type { AccessibleProject } from '../projects/access/projectAccessResolver.js';
import { CreateWorkItemDto } from './dto/createWorkItem.dto.js';
import { WORK_ITEM_CREATE_WRITE_LIMIT } from './tokens.js';
import { WorkItemsService } from './workItems.service.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class WorkItemsController {
  constructor(private readonly workItemsService: WorkItemsService) {}

  @Post(`projects/:${PROJECT_ROUTE_PARAM}/work-items`)
  @ProjectWrite('project.workitems.create', {
    writeLimit: WORK_ITEM_CREATE_WRITE_LIMIT,
  })
  async create(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentProject() project: AccessibleProject,
    @CurrentUserId() userId: string,
    @Body() dto: CreateWorkItemDto,
    @Req() req: Request & { requestId?: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateWorkItemResponse> {
    const { outcome, workItem } = await this.workItemsService.create({
      workspaceId: ws.id,
      project,
      actorId: userId,
      title: dto.title,
      description: dto.description ?? '',
      idempotencyKey: dto.idempotencyKey,
      stateId: dto.stateId,
      priorityId: dto.priorityId,
      requestId: req.requestId,
    });

    res.status(outcome === 'created' ? HttpStatus.CREATED : HttpStatus.OK);
    return { workItem };
  }
}
