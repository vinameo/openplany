import { Injectable } from '@nestjs/common';
import {
  addableProjectRoleRange,
  addableProjectRoles,
  canAddProjectMembers,
  MEMBER_CANDIDATE_LIMIT,
  PROJECT_MEMBER_LIST_MAX,
  PROJECT_ROLE_RANK,
  PROJECT_ROLES,
  type ProjectActor,
  type ProjectMemberCandidate,
  type ProjectMemberCandidateListResponse,
  type ProjectMemberCandidateStatus,
  type ProjectMemberListResponse,
  type ProjectRole,
  workspaceRolesWithImplicitProjectAccess,
} from '@repo/contracts';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { ProjectEvents } from '../events/projectEvents.js';
import { toProjectMemberResponse } from './dto/projectMemberResponse.js';
import { ProjectMembersRepository } from './projectMembers.repository.js';

@Injectable()
export class ProjectMembersService {
  constructor(
    private readonly repository: ProjectMembersRepository,
    private readonly events: ProjectEvents,
  ) {}

  async list(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    requestId?: string,
  ): Promise<ProjectMemberListResponse> {
    const actor: ProjectActor = {
      userId: actorId,
      workspaceRole: workspace.role,
      effectiveRole: accessible.access.role,
      permissions: accessible.access.permissions,
    };

    const canAdd = canAddProjectMembers(
      accessible.access.permissions,
      workspace.permissions,
    );
    const includeEmail = workspace.permissions.includes(
      'workspace.members.email.view',
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
    const actor: ProjectActor = {
      userId: actorId,
      workspaceRole: workspace.role,
      effectiveRole: accessible.access.role,
      permissions: accessible.access.permissions,
    };

    const mode: 'contains' | 'exact' = workspace.permissions.includes(
      'workspace.members.email.view',
    )
      ? 'contains'
      : 'exact';

    const rows = await this.repository.searchCandidates({
      workspaceId: workspace.id,
      projectId: accessible.project.id,
      query,
      mode,
      limit: MEMBER_CANDIDATE_LIMIT,
    });

    const implicitWsRoles = workspaceRolesWithImplicitProjectAccess();

    const candidates: ProjectMemberCandidate[] = rows.map((row) => {
      const isWorkspaceAdmin = implicitWsRoles.includes(row.workspaceRole);
      const status: ProjectMemberCandidateStatus = isWorkspaceAdmin
        ? 'workspace_admin'
        : row.alreadyMember
          ? 'already_member'
          : 'addable';

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
}

