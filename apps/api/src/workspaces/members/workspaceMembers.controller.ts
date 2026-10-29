import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  CHANGE_WORKSPACE_ROLE_REQUIREMENT,
  type AddWorkspaceMembersResponse,
  type ChangeWorkspaceRoleResponse,
  type MemberCandidateListResponse,
  type WorkspaceMemberListResponse,
  type WorkspaceRoleChangePreview,
} from '@repo/contracts';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { CurrentWorkspace } from '../currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceRead, WorkspaceWrite } from '../workspaceAccess.decorator.js';
import { WorkspaceMembersService } from './workspaceMembers.service.js';
import { MemberCandidateQueryDto } from '../../common/memberCandidateQuery.dto.js';
import { WorkspaceMemberCandidateSearch } from './memberCandidateSearch.decorator.js';
import { AddWorkspaceMembersDto } from './dto/addWorkspaceMembers.dto.js';
import { MemberUserIdParam } from '../../common/memberUserIdParam.js';
import { RoleChangePreviewRateLimitGuard } from './roleChangePreviewRateLimitGuard.js';
import { RoleChangePreviewQueryDto } from './dto/roleChangePreviewQuery.dto.js';
import { ChangeWorkspaceRoleDto } from './dto/changeWorkspaceRole.dto.js';

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
  @WorkspaceMemberCandidateSearch()
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

  @Get('members/:userId/role-change-preview')
  @WorkspaceRead(CHANGE_WORKSPACE_ROLE_REQUIREMENT)
  @UseGuards(RoleChangePreviewRateLimitGuard)
  preview(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() actorId: string,
    @MemberUserIdParam() userId: string,
    @Query() q: RoleChangePreviewQueryDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<WorkspaceRoleChangePreview> {
    return this.service.previewRoleChange(
      ws,
      actorId,
      userId,
      q,
      req.requestId ?? '',
    );
  }

  @Patch('members/:userId')
  @WorkspaceWrite(CHANGE_WORKSPACE_ROLE_REQUIREMENT)
  change(
    @CurrentWorkspace() ws: MemberWorkspace,
    @CurrentUserId() actorId: string,
    @MemberUserIdParam() userId: string,
    @Body() dto: ChangeWorkspaceRoleDto,
    @Req() req: Request & { requestId?: string },
  ): Promise<ChangeWorkspaceRoleResponse> {
    return this.service.changeRole(
      ws,
      actorId,
      userId,
      dto,
      req.requestId ?? '',
    );
  }
}
