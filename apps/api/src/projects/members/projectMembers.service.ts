import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  addableProjectRoleRange,
  addableProjectRoles,
  canAddProjectMembers,
  hasImplicitProjectAccess,
  isProjectRoleOutOfRange,
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
  type ProjectAccessPolicies,
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
import { ProjectAccessPolicyStore } from '../../roles/projectAccessPolicyStore.js';
import type { MemberWorkspace } from '../../workspaces/repositories/workspaces.repository.js';
import type { AccessibleProject } from '../access/projectAccessResolver.js';
import { ProjectEvents } from '../events/projectEvents.js';
import { ProjectsService } from '../projects.service.js';
import type { AddProjectMembersDto } from './dto/addProjectMembers.dto.js';
import {
  toInheritedProjectMemberResponse,
  toProjectMemberResponse,
} from './dto/projectMemberResponse.js';
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
  policies: ProjectAccessPolicies,
): ProjectMemberCandidateStatus {
  if (hasImplicitProjectAccess(policies[workspaceRole])) {
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
  policies: ProjectAccessPolicies,
): ProjectMemberNotAddableReason | null {
  const status = candidateStatus(
    target.workspaceRole,
    target.alreadyMember,
    policies,
  );
  if (status !== 'addable') return status;
  return addableProjectRoles(actor, target, policies).includes(role)
    ? null
    : 'role_not_allowed';
}

@Injectable()
export class ProjectMembersService {
  private readonly logger = new Logger(ProjectMembersService.name);

  constructor(
    private readonly repository: ProjectMembersRepository,
    private readonly events: ProjectEvents,
    private readonly projectsService: ProjectsService,
    private readonly clock: Clock,
    private readonly policyStore: ProjectAccessPolicyStore,
  ) {}

  async list(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    requestId?: string,
  ): Promise<ProjectMemberListResponse> {
    const policies = this.policyStore.policies();
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);
    const canAdd = canAddProjectMembers(
      accessible.access.permissions,
      workspace.permissions,
    );

    const roleOrder: ProjectRole[] = [...PROJECT_ROLES].sort(
      (a, b) => PROJECT_ROLE_RANK[b] - PROJECT_ROLE_RANK[a],
    );

    const implicitRoles = workspaceRolesWithImplicitProjectAccess(policies);
    const showInherited = workspace.permissions.includes('workspace.members.view');

    const [assigned, inherited] = await Promise.all([
      this.repository.list(accessible.project.id, {
        includeEmail,
        roleOrder,
        limit: PROJECT_MEMBER_LIST_MAX,
        implicitRoles,
      }),
      showInherited && implicitRoles.length > 0
        ? this.repository.listInherited(workspace.id, {
            implicitRoles,
            includeEmail,
            limit: PROJECT_MEMBER_LIST_MAX,
          })
        : Promise.resolve({ members: [], total: 0 }),
    ]);

    let outOfRangeCount = 0;
    for (const row of assigned.members) {
      if (
        isProjectRoleOutOfRange(
          { workspaceRole: row.workspaceRole, assignedRole: row.assignedRole },
          policies,
        )
      ) {
        outOfRangeCount++;
      }
    }
    if (outOfRangeCount > 0) {
      this.logger.warn(
        `project.members.out_of_range projectId=${accessible.project.id} count=${outOfRangeCount}`,
      );
    }

    const assignedMembers = assigned.members.map((row) =>
      toProjectMemberResponse(row, { includeEmail, policies }),
    );
    const inheritedMembers = inherited.members.map((row) =>
      toInheritedProjectMemberResponse(row, { includeEmail, policies }),
    );

    const total = assigned.total + inherited.total;

    // When combined count exceeds PROJECT_MEMBER_LIST_MAX, keep inherited first
    const remaining = Math.max(
      0,
      PROJECT_MEMBER_LIST_MAX - inheritedMembers.length,
    );
    const combined = [
      ...inheritedMembers,
      ...assignedMembers.slice(0, remaining),
    ];

    // Return order: role rank descending -> name -> memberId
    combined.sort((a, b) => {
      const rankDiff = PROJECT_ROLE_RANK[b.role] - PROJECT_ROLE_RANK[a.role];
      if (rankDiff !== 0) return rankDiff;
      const nameA = (
        `${a.firstName} ${a.lastName}`.trim() || a.displayName
      ).toLowerCase();
      const nameB = (
        `${b.firstName} ${b.lastName}`.trim() || b.displayName
      ).toLowerCase();
      const nameDiff = nameA.localeCompare(nameB);
      if (nameDiff !== 0) return nameDiff;
      return a.userId.localeCompare(b.userId);
    });

    const truncated = total > combined.length;
    if (truncated) {
      await this.events.membersListTruncated({
        projectId: accessible.project.id,
        total,
        requestId,
      });
    }

    const addableRoles = canAdd ? addableProjectRoleRange(actor, policies) : [];

    return {
      members: combined,
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
    const policies = this.policyStore.policies();
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
      const status = candidateStatus(
        row.workspaceRole,
        row.alreadyMember,
        policies,
      );

      const addableRoles =
        status === 'addable'
          ? addableProjectRoles(
              actor,
              {
                userId: row.userId,
                workspaceRole: row.workspaceRole,
              },
              policies,
            )
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
        workspaceRole: row.workspaceRole,
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
    const policies = this.policyStore.policies();
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);

    // 1. Permission check (before parsing rows, so outsiders cannot probe inputs)
    if (
      !canAddProjectMembers(
        accessible.access.permissions,
        workspace.permissions,
      )
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        MEMBER_MESSAGES.notAllowed,
      );
    }

    // 2. Reject intra-batch duplicate userIds
    const dup = duplicateMemberRowFields(dto.members);
    if (Object.keys(dup).length > 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        MEMBER_MESSAGES.checkFields,
        { fields: dup },
      );
    }

    // 3. Early check on actor role range (before database locks)
    const range = addableProjectRoleRange(actor, policies);
    const outsideRange = dto.members.some((m) => !range.includes(m.role));
    if (outsideRange) {
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
      roleRange: (a) => addableProjectRoleRange(a.actor, policies),
      rowRejection: (a, target, role) =>
        rowRejection(a.actor, target, role, policies),
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
        toProjectMemberResponse(m, { includeEmail, policies }),
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
