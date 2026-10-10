import { Injectable, Logger } from '@nestjs/common';
import {
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_RANK,
  WORKSPACE_MEMBER_LIST_MAX,
  addableWorkspaceRoles,
  type WorkspaceMemberListResponse,
} from '@repo/contracts';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceMembersRepository } from './workspaceMembers.repository.js';
import { toWorkspaceMemberResponse } from './dto/workspaceMemberResponse.dto.js';

@Injectable()
export class WorkspaceMembersService {
  private readonly logger = new Logger(WorkspaceMembersService.name);

  constructor(private readonly repository: WorkspaceMembersRepository) {}

  async list(
    ws: MemberWorkspace,
    userId: string,
    requestId: string,
  ): Promise<WorkspaceMemberListResponse> {
    const includeEmail = ws.permissions.includes('workspace.members.email.view');
    const roleOrder = [...WORKSPACE_ROLES].sort(
      (a, b) => WORKSPACE_ROLE_RANK[b] - WORKSPACE_ROLE_RANK[a],
    );

    const { members, total } = await this.repository.list(ws.id, {
      includeEmail,
      roleOrder,
      limit: WORKSPACE_MEMBER_LIST_MAX,
    });

    const truncated = total > members.length;
    if (truncated) {
      this.logger.warn(
        `workspace.members.list.truncated workspaceId=${ws.id} total=${total} requestId=${requestId}`,
      );
    }

    const addableRoles = addableWorkspaceRoles({
      userId,
      role: ws.role,
      permissions: ws.permissions,
    });

    return {
      members: members.map((m) => toWorkspaceMemberResponse(m, { includeEmail })),
      total,
      truncated,
      addableRoles,
    };
  }
}

