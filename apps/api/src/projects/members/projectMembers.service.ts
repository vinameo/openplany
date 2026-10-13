import { Injectable } from '@nestjs/common';
import {
  addableProjectRoleRange,
  canAddProjectMembers,
  PROJECT_MEMBER_LIST_MAX,
  PROJECT_ROLE_RANK,
  PROJECT_ROLES,
  type ProjectActor,
  type ProjectMemberListResponse,
  type ProjectRole,
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
}
