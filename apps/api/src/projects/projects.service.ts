import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  pickChangedFields,
  projectCreatorMembershipRole,
  PROJECT_ERROR_MESSAGE_REFS,
  PROJECT_MEMBER_PREVIEW_MAX,
  workspaceRolesWithImplicitProjectAccess,
  type CreateProjectResponse,
  type ProjectListItem,
  type ProjectListResponse,
  type ProjectResponse,
  type UpdateProjectResponse,
  type WorkspaceRole,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import { ProjectAccessPolicyStore } from '../roles/projectAccessPolicyStore.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import {
  ProjectAccessResolver,
  type AccessibleProject,
} from './access/projectAccessResolver.js';
import type { CreateProjectDto } from './dto/createProject.dto.js';
import {
  toProjectListItem,
  type ProjectMembersPreview,
  type ProjectRow,
} from './dto/projectResponse.js';
import type { UpdateProjectDto } from './dto/updateProject.dto.js';
import { ProjectEvents } from './events/projectEvents.js';
import {
  ProjectIdentifierTakenError,
  ProjectNameTakenError,
} from './projectErrors.js';
import { ProjectsRepository } from './repositories/projects.repository.js';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly repository: ProjectsRepository,
    private readonly resolver: ProjectAccessResolver,
    private readonly clock: Clock,
    private readonly events: ProjectEvents,
    private readonly policyStore: ProjectAccessPolicyStore,
  ) {}

  async list(
    workspace: MemberWorkspace,
    userId: string,
    requestId?: string,
  ): Promise<ProjectListResponse> {
    const { projects, total } = await this.resolver.forWorkspace({
      workspaceId: workspace.id,
      userId,
      workspaceRole: workspace.role,
    });

    const truncated = total > projects.length;
    if (truncated) {
      await this.events.listTruncated({
        workspaceId: workspace.id,
        userId,
        requestId,
        count: total,
      });
    }

    return {
      projects: await this.withMembers(projects, workspace),
      total,
      truncated,
    };
  }

  /** The project was already found and access-checked by ProjectAccessGuard. */
  async get(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
  ): Promise<ProjectResponse> {
    const [project] = await this.withMembers([accessible], workspace);
    if (project === undefined) {
      throw new Error(
        `Accessible project ${accessible.project.id} produced no list item`,
      );
    }
    return { project };
  }

  async create(
    workspace: MemberWorkspace,
    userId: string,
    dto: CreateProjectDto,
    requestId?: string,
  ): Promise<CreateProjectResponse> {
    const now = this.clock.now();
    const policies = this.policyStore.policies();

    let createdId: string;
    let creatorWorkspaceRole: WorkspaceRole;
    try {
      const res = await this.repository.create({
        workspaceId: workspace.id,
        actorId: userId,
        requestId,
        now,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description ?? '',
        iconName: dto.icon.name,
        iconColor: dto.icon.color,
        coverKey: dto.coverKey,
        creatorRoleFor: (role) => projectCreatorMembershipRole(policies[role]),
      });
      if (res.status === 'creator_gone') {
        throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', {
          key: 'workspace:errors.notFound',
        });
      }
      createdId = res.projectId;
      creatorWorkspaceRole = res.creatorWorkspaceRole;
    } catch (err: unknown) {
      if (err instanceof ProjectNameTakenError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_NAME_TAKEN',
          PROJECT_ERROR_MESSAGE_REFS.nameTaken,
          { fields: { name: PROJECT_ERROR_MESSAGE_REFS.nameTaken } },
        );
      }
      if (err instanceof ProjectIdentifierTakenError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_IDENTIFIER_TAKEN',
          PROJECT_ERROR_MESSAGE_REFS.identifierTaken,
          {
            fields: { identifier: PROJECT_ERROR_MESSAGE_REFS.identifierTaken },
          },
        );
      }
      throw err;
    }

    // Same access path as the list, so POST returns exactly the row GET would.
    // The workspace role is the one the transaction locked, not the guard's.
    const created = await this.resolver.forProject({
      workspaceId: workspace.id,
      userId,
      workspaceRole: creatorWorkspaceRole,
      projectId: createdId,
    });
    const [project] =
      created === null ? [] : await this.withMembers([created], workspace);
    if (project === undefined) {
      throw new Error(
        `Newly created project ${createdId} not accessible by creator ${userId}`,
      );
    }

    await this.events.created({
      projectId: createdId,
      workspaceId: workspace.id,
      actorId: userId,
      requestId,
    });

    return { project };
  }

  async update(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    dto: UpdateProjectDto,
    requestId?: string,
  ): Promise<UpdateProjectResponse> {
    const requested: Partial<{
      name: string;
      description: string;
      iconName: string;
      iconColor: string;
      coverKey: string;
      timezone: string | null;
    }> = {};

    let hasAny = false;
    if (dto.name !== undefined) {
      requested.name = dto.name;
      hasAny = true;
    }
    if (dto.description !== undefined) {
      requested.description = dto.description;
      hasAny = true;
    }
    if (dto.icon !== undefined) {
      requested.iconName = dto.icon.name;
      requested.iconColor = dto.icon.color;
      hasAny = true;
    }
    if (dto.coverKey !== undefined) {
      requested.coverKey = dto.coverKey;
      hasAny = true;
    }
    if (dto.timezone !== undefined) {
      requested.timezone = dto.timezone;
      hasAny = true;
    }

    if (!hasAny) {
      throw new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', {
        key: 'errors:nothingToUpdate',
      });
    }

    const EDITABLE_PROJECT_FIELDS = [
      'name',
      'description',
      'iconName',
      'iconColor',
      'coverKey',
      'timezone',
    ] as const;

    const changes = pickChangedFields(
      accessible.project,
      requested,
      EDITABLE_PROJECT_FIELDS,
    );

    // If icon changed (either name or color), send both iconName and iconColor
    if (changes.iconName !== undefined || changes.iconColor !== undefined) {
      changes.iconName = requested.iconName;
      changes.iconColor = requested.iconColor;
    }

    if (Object.keys(changes).length === 0) {
      return this.get(workspace, accessible);
    }

    let saved: ProjectRow | null;
    try {
      saved = await this.repository.update({
        projectId: accessible.project.id,
        workspaceId: workspace.id,
        actorId,
        now: this.clock.now(),
        changes,
      });
    } catch (err: unknown) {
      if (err instanceof ProjectNameTakenError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_NAME_TAKEN',
          PROJECT_ERROR_MESSAGE_REFS.nameTaken,
          { fields: { name: PROJECT_ERROR_MESSAGE_REFS.nameTaken } },
        );
      }
      throw err;
    }

    if (saved === null) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'PROJECT_NOT_FOUND',
        PROJECT_ERROR_MESSAGE_REFS.notFound,
      );
    }

    const [project] = await this.withMembers(
      [{ project: saved, access: accessible.access }],
      workspace,
    );

    if (project === undefined) {
      throw new Error(
        `Updated project ${accessible.project.id} produced no list item`,
      );
    }

    const fields: string[] = [];
    if (changes.name !== undefined) fields.push('name');
    if (changes.description !== undefined) fields.push('description');
    if (changes.iconName !== undefined || changes.iconColor !== undefined) {
      fields.push('icon');
    }
    if (changes.coverKey !== undefined) fields.push('coverKey');
    if (changes.timezone !== undefined) fields.push('timezone');

    try {
      await this.events.updated({
        projectId: saved.id,
        workspaceId: workspace.id,
        actorId,
        requestId,
        fields,
      });
    } catch (err: unknown) {
      this.logger.error(
        `project.updated_event_failed projectId=${saved.id} workspaceId=${workspace.id} actorId=${actorId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { project };
  }

  async delete(
    workspace: MemberWorkspace,
    accessible: AccessibleProject,
    actorId: string,
    requestId?: string,
  ): Promise<void> {
    const deleted = await this.repository.softDelete({
      projectId: accessible.project.id,
      workspaceId: workspace.id,
      actorId,
      now: this.clock.now(),
    });

    if (!deleted) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'PROJECT_NOT_FOUND',
        PROJECT_ERROR_MESSAGE_REFS.notFound,
      );
    }

    try {
      await this.events.deleted({
        projectId: accessible.project.id,
        workspaceId: workspace.id,
        actorId,
        requestId,
      });
    } catch (err: unknown) {
      this.logger.error(
        `project.deleted_event_failed projectId=${accessible.project.id} workspaceId=${workspace.id} actorId=${actorId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * The one place that decides which member data a viewer gets: only for
   * projects where they hold project.members.view, emails only with
   * workspace.members.email.view (RQ INV-06, INV-07).
   */
  private async withMembers(
    rows: readonly AccessibleProject[],
    workspace: MemberWorkspace,
  ): Promise<ProjectListItem[]> {
    const visible = rows
      .filter((r) => r.access.permissions.includes('project.members.view'))
      .map((r) => r.project.id);
    const policies = this.policyStore.policies();
    const implicitRoles = workspaceRolesWithImplicitProjectAccess(policies);
    const previews =
      visible.length === 0
        ? new Map<string, ProjectMembersPreview>()
        : await this.repository.membersOf(visible, {
            implicitRoles,
            includeEmail: workspace.permissions.includes(
              'workspace.members.email.view',
            ),
            limitPerProject: PROJECT_MEMBER_PREVIEW_MAX,
          });
    const canSee = new Set(visible);

    return rows.map(({ project, access }) =>
      toProjectListItem(
        project,
        access,
        canSee.has(project.id)
          ? (previews.get(project.id) ?? { members: [], total: 0 })
          : null,
        workspace.timezone,
      ),
    );
  }
}
