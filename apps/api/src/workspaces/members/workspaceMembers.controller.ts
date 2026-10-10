import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { WorkspaceMemberListResponse } from '@repo/contracts';
import { SessionGuard } from '../../auth/guards/sessionGuard.js';
import { CurrentUserId } from '../../auth/currentUser.decorator.js';
import { CurrentWorkspace } from '../currentWorkspace.decorator.js';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceRead } from '../workspaceAccess.decorator.js';
import { WorkspaceMembersService } from './workspaceMembers.service.js';

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
}

