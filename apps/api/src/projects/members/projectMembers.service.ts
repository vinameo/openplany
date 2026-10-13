import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addableProjectRoleRange,
  addableProjectRoles,
  canAddProjectMembers,
  MEMBER_CANDIDATE_LIMIT,
  MEMBER_MESSAGES,
  PROJECT_ERROR_MESSAGES,
  PROJECT_MEMBER_LIST_MAX,
  PROJECT_MEMBER_NOT_ADDABLE_FIELD,
  PROJECT_MEMBER_NOT_ADDABLE_MESSAGES,
  PROJECT_ROLE_RANK,
  PROJECT_ROLES,
  workspaceRolesWithImplicitProjectAccess,
  type AddProjectMembersResponse,
  type ProjectActor,
  type ProjectMemberCandidate,
  type ProjectMemberCandidateListResponse,
  type ProjectMemberCandidateStatus,
  type ProjectMemberListResponse,
  type ProjectMemberNotAddableReason,
  type ProjectRole,
  type WorkspaceRole,
} from '@repo/contracts';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import {
  duplicateMemberRowFields,
  unknownRoleFields,
} from '../../common/memberRows.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { ProjectEvents } from '../events/projectEvents.js';
import { ProjectsService } from '../projects.service.js';
import type { AddProjectMembersDto } from './dto/addProjectMembers.dto.js';
import { toProjectMemberResponse } from './dto/projectMemberResponse.js';
import { canSeeMemberEmails, toProjectActor } from './projectMemberActor.js';
import { ProjectMembersRepository } from './projectMembers.repository.js';

/** The actor of a request and what they may see, derived once per request. */
interface MembersView {
  actor: ProjectActor;
  includeEmail: boolean;
}

/**
 * Whether a workspace member can be added to the project at all. One rule for
 * the candidate search and for the batch check inside the add transaction.
 */
function candidateStatus(
  workspaceRole: WorkspaceRole,
  alreadyMember: boolean,
): ProjectMemberCandidateStatus {
  if (workspaceRolesWithImplicitProjectAccess().includes(workspaceRole)) {
    return 'workspace_admin';
  }
  return alreadyMember ? 'already_member' : 'addable';
}

function rowRejection(
  actor: ProjectActor,
  target: {
    userId: string;
    workspaceRole: WorkspaceRole;
    alreadyMember: boolean;
  },
  role: ProjectRole,
): ProjectMemberNotAddableReason | null {
  const status = candidateStatus(target.workspaceRole, target.alreadyMember);
  if (status !== 'addable') return status;
  return addableProjectRoles(actor, target).includes(role)
    ? null
    : 'role_not_allowed';
}

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly repository: ProjectMembersRepository,
    private readonly events: ProjectEvents,
    private readonly projectsService: ProjectsService,
    private readonly clock: Clock,
  ) {}

  async list(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    requestId?: string,
  ): Promise<ProjectMemberListResponse> {
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);
    const canAdd = canAddProjectMembers(
      accessible.access.permissions,
      workspace.permissions,
    );

    const roleOrder: ProjectRole[] = [...PROJECT_ROLES].sort(
      (a, b) => PROJECT_ROLE_RANK[b] - PROJECT_ROLE_RANK[a],
    );

    const { members: rows, total } = await this.repository.list(
      accessible.project.id,
      {
        includeEmail,
        roleOrder,
        limit: PROJECT_MEMBER_LIST_MAX,
      },
    );

    const members = rows.map((row) =>
      toProjectMemberResponse(row, { includeEmail }),
    );

    const truncated = total > members.length;
    if (truncated) {
      await this.events.membersListTruncated({
        projectId: accessible.project.id,
        total,
        requestId,
      });
    }

    const addableRoles = canAdd ? addableProjectRoleRange(actor) : [];

    return {
      members,
      total,
      truncated,
      addableRoles,
    };
  }

  async searchCandidates(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    query: string,
    requestId?: string,
  ): Promise<ProjectMemberCandidateListResponse> {
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);
    const mode: 'contains' | 'exact' = includeEmail ? 'contains' : 'exact';

    const rows = await this.repository.searchCandidates({
      workspaceId: workspace.id,
      projectId: accessible.project.id,
      query,
      mode,
      limit: MEMBER_CANDIDATE_LIMIT,
    });

    const candidates: ProjectMemberCandidate[] = rows.map((row) => {
      const status = candidateStatus(row.workspaceRole, row.alreadyMember);

      const addableRoles =
        status === 'addable'
          ? addableProjectRoles(actor, {
              userId: row.userId,
              workspaceRole: row.workspaceRole,
            })
          : [];

      const email = mode === 'contains' ? (row.email ?? query) : query;

      return {
        userId: row.userId,
        firstName: row.firstName,
        lastName: row.lastName,
        displayName: row.displayName,
        email,
        avatarUrl: row.avatarUrl,
        status,
        addableRoles,
      };
    });

    await this.events.memberCandidatesSearched({
      projectId: accessible.project.id,
      workspaceId: workspace.id,
      actorId,
      mode,
      resultCount: candidates.length,
      requestId,
    });

    return { candidates };
  }

  async add(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    dto: AddProjectMembersDto,
    requestId?: string,
  ): Promise<AddProjectMembersResponse> {
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);

    const dup = duplicateMemberRowFields(dto.members);
    if (Object.keys(dup).length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        MEMBER_MESSAGES.checkFields,
        { fields: dup },
      );
    }

    const range = addableProjectRoleRange(actor);
    if (dto.members.some((m) => !range.includes(m.role))) {
      await this.events.addRoleForbidden({
        projectId: accessible.project.id,
        actorId,
        requestId,
      });
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.roleNotAllowed,
      );
    }

    const result = await this.repository.addMembers({
      workspaceId: workspace.id,
      projectId: accessible.project.id,
      actorId,
      requestId: requestId ?? '',
      now: this.clock.now(),
      includeEmail,
      members: dto.members,
      canAdd: (a) =>
        canAddProjectMembers(a.projectPermissions, a.workspacePermissions),
      roleRange: (a) => addableProjectRoleRange(a.actor),
      rowRejection: (a, target, role) => rowRejection(a.actor, target, role),
    });

    if (result.status === 'project_gone') {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'PROJECT_NOT_FOUND',
        PROJECT_ERROR_MESSAGES.notFound,
      );
    }

    if (result.status === 'actor_forbidden') {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.notAllowed,
      );
    }

    if (result.status === 'role_forbidden') {
      await this.events.addRoleForbidden({
        projectId: accessible.project.id,
        actorId,
        requestId,
      });
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.roleNotAllowed,
      );
    }

    if (result.status === 'role_unknown') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        MEMBER_MESSAGES.checkFields,
        { fields: unknownRoleFields(dto.members) },
      );
    }

    if (result.status === 'rejected') {
      const fields: Record<string, string> = {};
      for (const r of result.rows) {
        const fieldName = PROJECT_MEMBER_NOT_ADDABLE_FIELD[r.reason];
        fields[`members.${r.index}.${fieldName}`] =
          PROJECT_MEMBER_NOT_ADDABLE_MESSAGES[r.reason];
      }
      throw new ApiException(
        HttpStatus.CONFLICT,
        'MEMBERS_NOT_ADDABLE',
        MEMBER_MESSAGES.someNotAdded,
        { fields },
      );
    }

    const roles = Array.from(new Set(dto.members.map((m) => m.role)));
    await this.events.membersAdded({
      projectId: accessible.project.id,
      workspaceId: workspace.id,
      actorId,
      actorRole: actor.effectiveRole,
      count: result.members.length,
      reactivatedCount: result.reactivatedCount,
      roles,
      requestId,
    });

    const { project } = await this.projectsService.get(workspace, accessible);

    return {
      members: result.members.map((m) =>
        toProjectMemberResponse(m, { includeEmail }),
      ),
      project,
    };
  }

  private viewOf(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
  ): MembersView {
    return {
      actor: toProjectActor(actorId, workspace.role, accessible.access),
      includeEmail: canSeeMemberEmails(workspace.permissions),
    };
  }
}
