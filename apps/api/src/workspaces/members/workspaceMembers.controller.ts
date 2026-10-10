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
import type { Request } from 'express';
import type {
  AddWorkspaceMembersResponse,
  MemberCandidateListResponse,
  WorkspaceMemberListResponse,
} from '@repo/contracts';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { CurrentWorkspace } from '../currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceRead, WorkspaceWrite } from '../workspaceAccess.decorator.js';
import { WorkspaceMembersService } from './workspaceMembers.service.js';
import { MemberCandidateQueryDto } from './dto/memberCandidateQuery.dto.js';
import { MemberCandidateRateLimitGuard } from './memberCandidateRateLimitGuard.js';
import { AddWorkspaceMembersDto } from './dto/addWorkspaceMembers.dto.js';

@Controller('workspaces/:slug')
@UseGuards(SessionGuard)
export class WorkspaceMembersController {
  constructor(private readonly service: WorkspaceMembersService) {}

  @Get('members')
  @WorkspaceRead('workspace.members.view')
  list(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Req() req: Request & { requestId?: string },
  ): Promise<WorkspaceMemberListResponse> {
    return this.service.list(ws, userId, req.requestId ?? '');
  }

  @Post('members')
  @WorkspaceWrite('workspace.members.add')
  @HttpCode(HttpStatus.CREATED)
  add(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Body() dto: AddWorkspaceMembersDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<AddWorkspaceMembersResponse> {
    return this.service.add(ws, userId, dto, req.requestId ?? '');
  }

  @Get('member-candidates')
  @WorkspaceRead('workspace.members.add')
  @UseGuards(MemberCandidateRateLimitGuard)
  candidates(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() userId: string,
    @Query() q: MemberCandidateQueryDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<MemberCandidateListResponse> {
    return this.service.searchCandidates(
      ws,
      userId,
      q.email,
      req.requestId ?? '',
    );
  }
}

