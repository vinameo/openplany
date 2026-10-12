import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PROJECT_ERROR_MESSAGES,
  PROJECT_MEMBER_PREVIEW_MAX,
  type CreateProjectResponse,
  type ProjectListItem,
  type ProjectListResponse,
  type ProjectResponse,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import {
  ProjectAccessResolver,
  type AccessibleProject,
} from './access/projectAccessResolver.js';
import type { CreateProjectDto } from './dto/createProject.dto.js';
import {
  toProjectListItem,
  type ProjectMembersPreview,
} from './dto/projectResponse.js';
import { ProjectEvents } from './events/projectEvents.js';
import {
  ProjectIdentifierTakenError,
  ProjectNameTakenError,
} from './projectErrors.js';
import { ProjectsRepository } from './repositories/projects.repository.js';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly repository: ProjectsRepository,
    private readonly resolver: ProjectAccessResolver,
    private readonly clock: Clock,
    private readonly events: ProjectEvents,
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

    let createdId: string;
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
      });
      createdId = res.projectId;
    } catch (err: unknown) {
      if (err instanceof ProjectNameTakenError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_NAME_TAKEN',
          PROJECT_ERROR_MESSAGES.nameTaken,
          { fields: { name: PROJECT_ERROR_MESSAGES.nameTaken } },
        );
      }
      if (err instanceof ProjectIdentifierTakenError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'PROJECT_IDENTIFIER_TAKEN',
          PROJECT_ERROR_MESSAGES.identifierTaken,
          { fields: { identifier: PROJECT_ERROR_MESSAGES.identifierTaken } },
        );
      }
      throw err;
    }

    // Same access path as the list, so POST returns exactly the row GET would.
    const created = await this.resolver.forProject({
      workspaceId: workspace.id,
      userId,
      workspaceRole: workspace.role,
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
    const previews =
      visible.length === 0
        ? new Map<string, ProjectMembersPreview>()
        : await this.repository.membersOf(visible, {
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
      ),
    );
  }
}
