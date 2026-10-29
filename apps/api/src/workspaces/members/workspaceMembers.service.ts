import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  MEMBER_CANDIDATE_LIMIT,
  MEMBER_MESSAGE_REFS,
  MEMBER_NOT_ADDABLE_MESSAGE_REFS,
  WORKSPACE_ROLES,
  WORKSPACE_ROLE_RANK,
  WORKSPACE_MEMBER_LIST_MAX,
  WORKSPACE_ROLE_CHANGE_MESSAGE_REFS,
  addableWorkspaceRoles,
  type AddWorkspaceMembersResponse,
  type ChangeWorkspaceRoleResponse,
  type MemberCandidateListResponse,
  type WorkspaceMemberListResponse,
  type WorkspaceRole,
  type WorkspaceRoleChangePreview,
  type WorkspaceRoleChangeRejection,
} from '@repo/contracts';
import { ApiException, type ApiFieldError } from '../../common/apiException.js';
import {
  duplicateMemberRowFields,
  unknownRoleFields,
} from '../../common/memberRows.js';
import { Clock } from '../../auth/clock.js';
import type { MemberWorkspace } from '../repositories/workspaces.repository.js';
import { WorkspaceMembersRepository } from './workspaceMembers.repository.js';
import {
  toMemberCandidate,
  toWorkspaceMemberResponse,
} from './dto/workspaceMemberResponse.dto.js';
import { WorkspaceEvents } from '../events/workspaceEvents.js';
import type { AddWorkspaceMembersDto } from './dto/addWorkspaceMembers.dto.js';
import type { RoleChangePreviewQueryDto } from './dto/roleChangePreviewQuery.dto.js';
import type { ChangeWorkspaceRoleDto } from './dto/changeWorkspaceRole.dto.js';

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
    const includeEmail = ws.permissions.includes(
      'workspace.members.email.view',
    );
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

    const actor = {
      userId,
      role: ws.role,
      permissions: ws.permissions,
    };

    const addableRoles = addableWorkspaceRoles(actor);

    return {
      members: members.map((m) =>
        toWorkspaceMemberResponse(m, { includeEmail, actor }),
      ),
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
    const duplicateFields = duplicateMemberRowFields(dto.members);
    if (Object.keys(duplicateFields).length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        MEMBER_MESSAGE_REFS.checkFields,
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
        'ROLE_NOT_ALLOWED',
        MEMBER_MESSAGE_REFS.roleNotAllowed,
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
        MEMBER_MESSAGE_REFS.notAllowed,
      );
    }

    // 5. Map workspace_gone
    if (result.status === 'workspace_gone') {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', {
        key: 'workspace:errors.notFound',
      });
    }

    if (result.status === 'role_unknown') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        MEMBER_MESSAGE_REFS.checkFields,
        { fields: unknownRoleFields(dto.members) },
      );
    }

    // 6. Map rejected
    if (result.status === 'rejected') {
      const fields: Record<string, ApiFieldError> = {};
      for (const r of result.rows) {
        fields[`members.${r.index}.userId`] =
          MEMBER_NOT_ADDABLE_MESSAGE_REFS[r.reason];
      }
      throw new ApiException(
        HttpStatus.CONFLICT,
        'MEMBERS_NOT_ADDABLE',
        MEMBER_MESSAGE_REFS.someNotAdded,
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

    const actor = {
      userId: actorId,
      role: ws.role,
      permissions: ws.permissions,
    };
    const includeEmail = ws.permissions.includes(
      'workspace.members.email.view',
    );
    return {
      members: result.members.map((m) =>
        toWorkspaceMemberResponse(m, { includeEmail, actor }),
      ),
    };
  }

  async previewRoleChange(
    ws: MemberWorkspace,
    actorId: string,
    targetUserId: string,
    query: RoleChangePreviewQueryDto,
    _requestId: string,
  ): Promise<WorkspaceRoleChangePreview> {
    const actor = {
      userId: actorId,
      role: ws.role,
      permissions: ws.permissions,
    };
    const result = await this.repository.previewRoleChange({
      workspaceId: ws.id,
      actor,
      targetUserId,
      targetRole: query.role,
    });
    if (result.status !== 'preview') {
      throw roleChangeRejected(result.status);
    }
    return result.preview;
  }

  async changeRole(
    ws: MemberWorkspace,
    actorId: string,
    targetUserId: string,
    dto: ChangeWorkspaceRoleDto,
    requestId: string,
  ): Promise<ChangeWorkspaceRoleResponse> {
    const now = this.clock.now();
    const result = await this.repository.changeRole({
      workspaceId: ws.id,
      actorId,
      targetUserId,
      fromRole: dto.fromRole,
      toRole: dto.role,
      projectRole: dto.projectRole,
      requestId,
      now,
    });

    if (result.status === 'workspace_gone') {
      throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', {
        key: 'workspace:errors.notFound',
      });
    }

    if (
      result.status === 'actor_forbidden' ||
      result.status === 'actor_cannot_choose'
    ) {
      await this.events.memberRoleForbidden({
        workspaceId: ws.id,
        actorId,
        targetId: targetUserId,
        requestId,
      });
      throw roleChangeRejected('actor_forbidden');
    }

    if (
      result.status === 'member_gone' ||
      result.status === 'role_changed' ||
      result.status === 'same_role'
    ) {
      throw roleChangeRejected(result.status);
    }

    if (result.status === 'project_role_out_of_range') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PROJECT_ROLE_NOT_ALLOWED',
        MEMBER_MESSAGE_REFS.roleOutOfRange,
        { fields: { projectRole: MEMBER_MESSAGE_REFS.roleOutOfRange } },
      );
    }

    if (result.status === 'last_admin') {
      await this.events.memberRoleLastAdmin({
        workspaceId: ws.id,
        actorId,
        targetId: targetUserId,
        requestId,
      });
      throw new ApiException(
        HttpStatus.CONFLICT,
        'LAST_ADMIN',
        WORKSPACE_ROLE_CHANGE_MESSAGE_REFS.lastAdmin,
      );
    }

    // Success
    await this.events.memberRoleChanged({
      workspaceId: ws.id,
      actorId,
      targetId: targetUserId,
      fromRole: result.fromRole,
      toRole: result.toRole,
      effect: result.effect,
      appliedProjectCount: result.appliedProjectCount,
      requestId,
    });

    const includeEmail = ws.permissions.includes(
      'workspace.members.email.view',
    );
    const actor = {
      userId: actorId,
      role: ws.role,
      permissions: ws.permissions,
    };

    return {
      member: toWorkspaceMemberResponse(result.member, {
        includeEmail,
        actor,
      }),
      effect: result.effect,
      appliedProjectCount: result.appliedProjectCount,
    };
  }
}

/** One HTTP answer per outcome shared by the preview and the change (API B6). */
function roleChangeRejected(
  status: 'member_gone' | WorkspaceRoleChangeRejection,
): ApiException {
  switch (status) {
    case 'member_gone':
      return new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        WORKSPACE_ROLE_CHANGE_MESSAGE_REFS.memberGone,
      );
    case 'actor_forbidden':
      return new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGE_REFS.roleNotAllowed,
      );
    case 'role_changed':
      return new ApiException(
        HttpStatus.CONFLICT,
        'ROLE_CHANGED',
        MEMBER_MESSAGE_REFS.roleChanged,
      );
    case 'same_role':
      return new ApiException(
        HttpStatus.BAD_REQUEST,
        'ROLE_UNCHANGED',
        MEMBER_MESSAGE_REFS.sameRole,
      );
  }
}
