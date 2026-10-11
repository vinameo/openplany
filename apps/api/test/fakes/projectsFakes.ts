import type { ProjectAccess, WorkspaceRole } from '@repo/contracts';
import { ProjectAccessResolver } from '../../src/projects/access/projectAccessResolver.js';
import type {
  ProjectMemberRow,
  ProjectRow,
} from '../../src/projects/dto/projectResponse.js';
import {
  ProjectEvents,
  type ProjectCreatedEvent,
  type ProjectListTruncatedEvent,
} from '../../src/projects/events/projectEvents.js';
import {
  ProjectsRepository,
  type CreateProjectInput,
} from '../../src/projects/repositories/projects.repository.js';

export class FakeProjectAccessResolver extends ProjectAccessResolver {
  public rows: { project: ProjectRow; access: ProjectAccess }[] = [];
  public lastInput?: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
  };

  async forWorkspace(input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
  }): Promise<{ project: ProjectRow; access: ProjectAccess }[]> {
    this.lastInput = input;
    return this.rows;
  }
}

export class FakeProjectsRepository extends ProjectsRepository {
  public membersByProjectId = new Map<string, ProjectMemberRow[]>();
  public createdProjects: CreateProjectInput[] = [];
  public accessibleProject: {
    project: ProjectRow;
    access: ProjectAccess;
  } | null = null;
  public lastMembersOfQuery?: {
    projectIds: readonly string[];
    opts: { includeEmail: boolean };
  };

  async membersOf(
    projectIds: readonly string[],
    opts: { includeEmail: boolean },
  ): Promise<Map<string, ProjectMemberRow[]>> {
    this.lastMembersOfQuery = { projectIds, opts };
    const res = new Map<string, ProjectMemberRow[]>();
    for (const id of projectIds) {
      const list = this.membersByProjectId.get(id) ?? [];
      res.set(
        id,
        list.map((m) => ({
          ...m,
          email: opts.includeEmail ? m.email : undefined,
        })),
      );
    }
    return res;
  }

  async create(input: CreateProjectInput): Promise<{ projectId: string }> {
    this.createdProjects.push(input);
    return { projectId: 'project-new-id' };
  }

  async findAccessible(_input: {
    workspaceId: string;
    userId: string;
    workspaceRole: WorkspaceRole;
    projectId: string;
  }): Promise<{ project: ProjectRow; access: ProjectAccess } | null> {
    return this.accessibleProject;
  }
}

export class FakeProjectEvents extends ProjectEvents {
  public createdEvents: ProjectCreatedEvent[] = [];
  public truncatedEvents: ProjectListTruncatedEvent[] = [];

  async created(event: ProjectCreatedEvent): Promise<void> {
    this.createdEvents.push(event);
  }

  async listTruncated(event: ProjectListTruncatedEvent): Promise<void> {
    this.truncatedEvents.push(event);
  }
}
