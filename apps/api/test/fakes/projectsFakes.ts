import { PROJECT_LIST_MAX } from '@repo/contracts';
import {
  ProjectAccessResolver,
  type AccessibleProject,
  type AccessibleProjectList,
  type ProjectLookup,
  type ProjectViewer,
} from '../../src/projects/access/projectAccessResolver.js';
import type {
  ProjectMemberRow,
  ProjectMembersPreview,
  ProjectRow,
} from '../../src/projects/dto/projectResponse.js';
import {
  ProjectEvents,
  type ProjectAccessDeniedEvent,
  type ProjectCreatedEvent,
  type ProjectListTruncatedEvent,
  type ProjectLookupRateLimitedEvent,
  type ProjectUpdatedEvent,
} from '../../src/projects/events/projectEvents.js';
import {
  ProjectsRepository,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../../src/projects/repositories/projects.repository.js';

export class FakeProjectAccessResolver extends ProjectAccessResolver {
  /** Accessible projects; forWorkspace returns the first PROJECT_LIST_MAX. */
  public rows: AccessibleProject[] = [];
  /** Overrides the total (defaults to rows.length) to simulate a cut list. */
  public total?: number;
  /** What forProject returns. */
  public project: AccessibleProject | null = null;
  public lastInput?: ProjectViewer;

  async forWorkspace(viewer: ProjectViewer): Promise<AccessibleProjectList> {
    this.lastInput = viewer;
    return {
      projects: this.rows.slice(0, PROJECT_LIST_MAX),
      total: this.total ?? this.rows.length,
    };
  }

  async forProject(
    viewer: ProjectViewer & { projectId: string },
  ): Promise<AccessibleProject | null> {
    this.lastInput = viewer;
    return this.project;
  }

  /** What forIdentifier returns. */
  public lookup: ProjectLookup = { kind: 'not_found' };
  public lastLookupInput?: ProjectViewer & { identifier: string };

  async forIdentifier(
    viewer: ProjectViewer & { identifier: string },
  ): Promise<ProjectLookup> {
    this.lastLookupInput = viewer;
    return this.lookup;
  }
}

export class FakeProjectsRepository extends ProjectsRepository {
  public membersByProjectId = new Map<string, ProjectMemberRow[]>();
  public createdProjects: CreateProjectInput[] = [];
  public updatedProjects: UpdateProjectInput[] = [];
  public updateResult: ProjectRow | null = null;
  public updateError?: Error;
  public lastMembersOfQuery?: {
    projectIds: readonly string[];
    opts: { includeEmail: boolean; limitPerProject: number };
  };

  async membersOf(
    projectIds: readonly string[],
    opts: { includeEmail: boolean; limitPerProject: number },
  ): Promise<Map<string, ProjectMembersPreview>> {
    this.lastMembersOfQuery = { projectIds, opts };
    const res = new Map<string, ProjectMembersPreview>();
    for (const id of projectIds) {
      const list = this.membersByProjectId.get(id) ?? [];
      if (list.length === 0) continue;
      res.set(id, {
        total: list.length,
        members: list.slice(0, opts.limitPerProject).map((m) => {
          const { email, ...rest } = m;
          return opts.includeEmail && email !== undefined
            ? { ...rest, email }
            : rest;
        }),
      });
    }
    return res;
  }

  async create(input: CreateProjectInput): Promise<{ projectId: string }> {
    this.createdProjects.push(input);
    return { projectId: 'project-new-id' };
  }

  async update(input: UpdateProjectInput): Promise<ProjectRow | null> {
    this.updatedProjects.push(input);
    if (this.updateError) {
      throw this.updateError;
    }
    return this.updateResult;
  }
}

export class FakeProjectEvents extends ProjectEvents {
  public createdEvents: ProjectCreatedEvent[] = [];
  public updatedEvents: ProjectUpdatedEvent[] = [];
  public truncatedEvents: ProjectListTruncatedEvent[] = [];
  public accessDeniedEvents: ProjectAccessDeniedEvent[] = [];
  public rateLimitedEvents: ProjectLookupRateLimitedEvent[] = [];

  async created(event: ProjectCreatedEvent): Promise<void> {
    this.createdEvents.push(event);
  }

  async updated(event: ProjectUpdatedEvent): Promise<void> {
    this.updatedEvents.push(event);
  }

  async listTruncated(event: ProjectListTruncatedEvent): Promise<void> {
    this.truncatedEvents.push(event);
  }

  async accessDenied(event: ProjectAccessDeniedEvent): Promise<void> {
    this.accessDeniedEvents.push(event);
  }

  async lookupRateLimited(event: ProjectLookupRateLimitedEvent): Promise<void> {
    this.rateLimitedEvents.push(event);
  }
}
