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
  PROJECT_ROLE_CHANGE_MESSAGES,
  PROJECT_ROLE_RANK,
  PROJECT_ROLES,
  workspaceRolesWithImplicitProjectAccess,
  type AddProjectMembersResponse,
  type ChangeProjectRoleResponse,
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
import type { ChangeProjectRoleDto } from './dto/changeProjectRole.dto.js';
import { buildProjectMemberResponse } from './dto/projectMemberResponse.js';
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
    const showInherited = workspace.permissions.includes(
      'workspace.members.view',
    );

    const [assigned, inherited, assignedAdminCount] = await Promise.all([
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
      this.repository.countAssignedAdmins(accessible.project.id, implicitRoles),
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
      buildProjectMemberResponse(row, { actor, includeEmail, policies }),
    );
    const inheritedMembers = inherited.members.map((row) =>
      buildProjectMemberResponse(row, { actor, includeEmail, policies }),
    );

    for (const [source, page] of [
      ['assigned', assigned],
      ['inherited', inherited],
    ] as const) {
      if (page.total > page.members.length) {
        await this.events.membersListTruncated({
          projectId: accessible.project.id,
          total: page.total,
          source,
          requestId,
        });
      }
    }

    const truncated = assigned.total > assigned.members.length;
    const addableRoles = canAdd ? addableProjectRoleRange(actor, policies) : [];

    return {
      members: [...inheritedMembers, ...assignedMembers],
      total: assigned.total,
      truncated,
      addableRoles,
      assignedAdminCount,
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

    const implicitRoles = workspaceRolesWithImplicitProjectAccess(policies);
    const result = await this.repository.addMembers({
      workspaceId: workspace.id,
      projectId: accessible.project.id,
      actorId,
      requestId: requestId ?? '',
      now: this.clock.now(),
      includeEmail,
      members: dto.members,
      implicitRoles,
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
        buildProjectMemberResponse(m, { actor, includeEmail, policies }),
      ),
      project,
      assignedAdminCount: result.assignedAdminCount,
    };
  }

  async changeRole(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    targetUserId: string,
    dto: ChangeProjectRoleDto,
    requestId?: string,
  ): Promise<ChangeProjectRoleResponse> {
    const policies = this.policyStore.policies();
    const { actor, includeEmail } = this.viewOf(workspace, accessible, actorId);

    const result = await this.repository.changeRole({
      workspaceId: workspace.id,
      projectId: accessible.project.id,
      actorId,
      targetUserId,
      fromRole: dto.fromRole,
      toRole: dto.role,
      requestId: requestId ?? '',
      now: this.clock.now(),
      includeEmail,
    });

    if (result.status === 'project_gone') {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'PROJECT_NOT_FOUND',
        PROJECT_ERROR_MESSAGES.notFound,
      );
    }

    if (result.status === 'member_gone') {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        PROJECT_ROLE_CHANGE_MESSAGES.memberGone,
      );
    }

    if (
      result.status === 'actor_forbidden' ||
      result.status === 'cant_change'
    ) {
      await this.events.roleForbidden({
        projectId: accessible.project.id,
        actorId,
        targetId: targetUserId,
        requestId,
      });
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        PROJECT_ROLE_CHANGE_MESSAGES.cantChange,
      );
    }

    if (result.status === 'role_inherited') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ROLE_INHERITED',
        PROJECT_ROLE_CHANGE_MESSAGES.inherited,
      );
    }

    if (result.status === 'role_changed') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        'ROLE_CHANGED',
        MEMBER_MESSAGES.roleChanged,
      );
    }

    if (result.status === 'role_unchanged') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'ROLE_UNCHANGED',
        MEMBER_MESSAGES.sameRole,
      );
    }

    if (result.status === 'role_not_allowed_for_workspace_role') {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'PROJECT_ROLE_NOT_ALLOWED',
        MEMBER_MESSAGES.roleOutOfRange,
        { fields: { role: MEMBER_MESSAGES.roleOutOfRange } },
      );
    }

    if (result.status === 'role_not_allowed') {
      await this.events.roleForbidden({
        projectId: accessible.project.id,
        actorId,
        targetId: targetUserId,
        requestId,
      });
      // Own code, so the client picks its sentence without reading `message`.
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'ROLE_NOT_ALLOWED',
        MEMBER_MESSAGES.roleNotAllowed,
      );
    }

    await this.events.roleChanged({
      projectId: accessible.project.id,
      actorId,
      targetId: targetUserId,
      fromRole: result.fromRole,
      toRole: result.toRole,
      requestId,
    });

    const member = buildProjectMemberResponse(result.member, {
      actor,
      includeEmail,
      policies,
    });

    return {
      member,
      assignedAdminCount: result.assignedAdminCount,
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
