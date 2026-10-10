import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
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
import {
  InstanceAdminDeniedMessage,
  InstanceAdminGuard,
} from '../admin/instanceAdminGuard.js';
import { CurrentWorkspace } from './currentWorkspace.decorator.js';
import { CreateWorkspaceDto } from './dto/createWorkspace.dto.js';
import { SlugCheckQueryDto } from './dto/slugCheckQuery.dto.js';
import { UpdateWorkspaceDto } from './dto/updateWorkspace.dto.js';
import { toWorkspaceResponse } from './dto/workspaceResponse.dto.js';
import type { MemberWorkspace } from './repositories/workspaces.repository.js';
import { WorkspaceWrite } from './workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacesService } from './workspaces.service.js';

@Controller('workspaces')
@UseGuards(SessionGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('slug-check')
  @UseGuards(InstanceAdminGuard)
  @InstanceAdminDeniedMessage(
    "You don't have permission to check workspace slugs",
  )
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
  @UseGuards(InstanceAdminGuard)
  @InstanceAdminDeniedMessage("You don't have permission to create workspaces")
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
  async getBySlug(
    @CurrentUserId() userId: string,
    @CurrentWorkspace() workspace: MemberWorkspace,
  ): Promise<WorkspaceResponse> {
    // Spec API7: GET also records last_workspace_id. Awaited (never floating);
    // the service logs and absorbs a failed write so the read still succeeds.
    await this.workspacesService.rememberLastWorkspace(userId, workspace.id);
    return toWorkspaceResponse(workspace);
  }

  @Patch(':slug')
  @WorkspaceWrite('workspace.settings.update')
  update(
    @CurrentUserId() userId: string,
    @CurrentWorkspace() workspace: MemberWorkspace,
    @Body() dto: UpdateWorkspaceDto,
    @Req() request: Request,
  ): Promise<WorkspaceResponse> {
    return this.workspacesService.update(
      workspace,
      userId,
      dto,
      request.requestId,
    );
  }
}
