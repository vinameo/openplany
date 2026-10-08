import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type {
  SlugCheckResponse,
  WorkspaceListResponse,
  WorkspaceResponse,
} from '@repo/contracts';
import type { Request, Response } from 'express';
import { CurrentUserId } from '../auth/currentUser.decorator.js';
import { SessionGuard } from '../auth/guards/sessionGuard.js';
import { CurrentWorkspace } from './currentWorkspace.decorator.js';
import { CreateWorkspaceDto } from './dto/createWorkspace.dto.js';
import { SlugCheckQueryDto } from './dto/slugCheckQuery.dto.js';
import { toWorkspaceResponse } from './dto/workspaceResponse.dto.js';
import type { MemberWorkspace } from './repositories/workspaces.repository.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('slug-check')
  checkSlug(
    @CurrentUserId() userId: string,
    @Query() query: SlugCheckQueryDto,
    @Req() request: Request,
  ): Promise<SlugCheckResponse> {
    return this.workspacesService.checkSlug(
      userId,
      query.slug,
      request.requestId,
    );
  }

  @Post()
  async create(
    @CurrentUserId() userId: string,
    @Body() dto: CreateWorkspaceDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<WorkspaceResponse> {
    const created = await this.workspacesService.create(
      userId,
      dto,
      request.requestId,
    );
    response.status(HttpStatus.CREATED);
    response.setHeader('Location', `/api/workspaces/${created.slug}`);
    return created;
  }

  @Get()
  list(@CurrentUserId() userId: string): Promise<WorkspaceListResponse> {
    return this.workspacesService.listForMember(userId);
  }

  @Get(':slug')
  @UseGuards(WorkspaceMemberGuard)
  getBySlug(
    @CurrentUserId() userId: string,
    @CurrentWorkspace() workspace: MemberWorkspace,
  ): WorkspaceResponse {
    void this.workspacesService.rememberLastWorkspace(userId, workspace.id);
    return toWorkspaceResponse(workspace);
  }
}

