import { HttpStatus, Injectable } from '@nestjs/common';
import {
  PROJECT_ERROR_MESSAGES,
  PROJECT_LIST_MAX,
  type CreateProjectResponse,
  type ProjectListResponse,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { MemberWorkspace } from '../workspaces/repositories/workspaces.repository.js';
import { ProjectAccessResolver } from './access/projectAccessResolver.js';
import type { CreateProjectDto } from './dto/createProject.dto.js';
import {
  toProjectListItem,
  type ProjectMemberRow,
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
    const rows = await this.resolver.forWorkspace({
      workspaceId: workspace.id,
      userId,
      workspaceRole: workspace.role,
    });

    const truncated = rows.length > PROJECT_LIST_MAX;
    const finalRows = truncated ? rows.slice(0, PROJECT_LIST_MAX) : rows;
    if (truncated) {
      await this.events.listTruncated({
        workspaceId: workspace.id,
        userId,
        requestId,
        count: rows.length,
      });
    }

    const memberProjectIds = finalRows
      .filter((r) => r.access.permissions.includes('project.members.view'))
      .map((r) => r.project.id);

    const includeEmail = workspace.permissions.includes(
      'workspace.members.email.view',
    );

    const membersMap =
      memberProjectIds.length > 0
        ? await this.repository.membersOf(memberProjectIds, { includeEmail })
        : new Map<string, ProjectMemberRow[]>();

    const projects = finalRows.map((r) => {
      const members = r.access.permissions.includes('project.members.view')
        ? membersMap.get(r.project.id) ?? []
        : null;
      return toProjectListItem(r.project, r.access, members);
    });

    return {
      projects,
      total: projects.length,
      truncated,
    };
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

    const item = await this.repository.findAccessible({
      workspaceId: workspace.id,
      userId,
      workspaceRole: workspace.role,
      projectId: createdId,
    });

    if (!item) {
      throw new Error(
        `Newly created project ${createdId} not accessible by creator ${userId}`,
      );
    }

    const includeEmail = workspace.permissions.includes(
      'workspace.members.email.view',
    );
    const membersMap = item.access.permissions.includes('project.members.view')
      ? await this.repository.membersOf([createdId], { includeEmail })
      : new Map<string, ProjectMemberRow[]>();

    const members = item.access.permissions.includes('project.members.view')
      ? membersMap.get(createdId) ?? []
      : null;

    const project = toProjectListItem(item.project, item.access, members);

    await this.events.created({
      projectId: createdId,
      workspaceId: workspace.id,
      actorId: userId,
      requestId,
    });

    return { project };
  }
}
