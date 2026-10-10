import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  MEMBER_CANDIDATE_LIMIT,
  MEMBER_NOT_ADDABLE_MESSAGES,
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_RANK,
  WORKSPACE_MEMBER_LIST_MAX,
  addableWorkspaceRoles,
  type AddWorkspaceMembersResponse,
  type MemberCandidateListResponse,
  type WorkspaceMemberListResponse,
  type WorkspaceRole,
} from '@repo/contracts';
import { ApiException } from '../../common/apiException.js';
import { Clock } from '../../auth/clock.js';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceMembersRepository } from './workspaceMembers.repository.js';
import {
  toMemberCandidate,
  toWorkspaceMemberResponse,
} from './dto/workspaceMemberResponse.dto.js';
import { WorkspaceEvents } from '../events/workspaceEvents.js';
import type { AddWorkspaceMembersDto } from './dto/addWorkspaceMembers.dto.js';

@Injectable()
export class WorkspaceMembersService {
  private readonly logger = new Logger(WorkspaceMembersService.name);

  constructor(
    private readonly repository: WorkspaceMembersRepository,
    private readonly events: WorkspaceEvents,
    private readonly clock: Clock,
  ) {}

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

  async searchCandidates(
    ws: MemberWorkspace,
    actorId: string,
    query: string,
    requestId: string,
  ): Promise<MemberCandidateListResponse> {
    const normalized = query.trim().toLowerCase();
    const rows = await this.repository.searchCandidates(
      ws.id,
      normalized,
      MEMBER_CANDIDATE_LIMIT,
    );

    await this.events.memberCandidatesSearched({
      workspaceId: ws.id,
      actorId,
      requestId,
      resultCount: rows.length,
    });

    return {
      candidates: rows.map(toMemberCandidate),
    };
  }

  async add(
    ws: MemberWorkspace,
    actorId: string,
    dto: AddWorkspaceMembersDto,
    requestId: string,
  ): Promise<AddWorkspaceMembersResponse> {
    // 1. Trùng userId (API-F3)
    const seenUserIds = new Set<string>();
    const duplicateFields: Record<string, string> = {};
    dto.members.forEach((m, index) => {
      if (seenUserIds.has(m.userId)) {
        duplicateFields[`members.${index}.userId`] =
          'This person is already in another row';
      } else {
        seenUserIds.add(m.userId);
      }
    });

    if (Object.keys(duplicateFields).length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Check the highlighted fields',
        { fields: duplicateFields },
      );
    }

    // 2. Vai trò vượt addableRoles
    const allowed = addableWorkspaceRoles({
      userId: actorId,
      role: ws.role,
      permissions: ws.permissions,
    });
    const hasForbiddenRole = dto.members.some((m) => !allowed.includes(m.role));
    if (hasForbiddenRole) {
      this.logger.warn(
        `workspace.members.add.role_forbidden workspaceId=${ws.id} userId=${actorId} requestId=${requestId}`,
      );
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        "You can't assign this role",
      );
    }

    // 3. Call repository.addMembers
    const result = await this.repository.addMembers({
      workspaceId: ws.id,
      actorId,
      requestId,
      now: this.clock.now(),
      members: dto.members,
      canAdd: (actor) => {
        const actorAllowed = addableWorkspaceRoles({
          userId: actorId,
          role: actor.role,
          permissions: actor.permissions,
        });
        return dto.members.every((m) => actorAllowed.includes(m.role));
      },
    });

    // 4. Map actor_forbidden
    if (result.status === 'actor_forbidden') {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        "You don't have permission to do this",
      );
    }

    // 5. Map workspace_gone
    if (result.status === 'workspace_gone') {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Workspace not found',
      );
    }

    // 6. Map rejected
    if (result.status === 'rejected') {
      const fields: Record<string, string> = {};
      for (const r of result.rows) {
        fields[`members.${r.index}.userId`] =
          MEMBER_NOT_ADDABLE_MESSAGES[r.reason];
      }
      throw new ApiException(
        HttpStatus.CONFLICT,
        'MEMBERS_NOT_ADDABLE',
        "Some people couldn't be added",
        { fields },
      );
    }

    // 7. Success
    const roles: Partial<Record<WorkspaceRole, number>> = {};
    for (const m of dto.members) {
      roles[m.role] = (roles[m.role] ?? 0) + 1;
    }
    await this.events.membersAdded({
      workspaceId: ws.id,
      actorId,
      actorRole: ws.role,
      requestId,
      occurredAt: this.clock.now(),
      count: result.members.length,
      reactivatedCount: result.reactivatedCount,
      roles,
    });

    const includeEmail = ws.permissions.includes(
      'workspace.members.email.view',
    );
    return {
      members: result.members.map((m) =>
        toWorkspaceMemberResponse(m, { includeEmail }),
      ),
    };
  }
}

