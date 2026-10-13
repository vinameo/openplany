export interface ProjectCreatedEvent {
  projectId: string;
  workspaceId: string;
  actorId: string;
  requestId?: string;
}

export interface ProjectUpdatedEvent {
  projectId: string;
  workspaceId: string;
  actorId: string;
  fields: readonly string[];
  requestId?: string;
}

export interface ProjectListTruncatedEvent {
  workspaceId: string;
  userId: string;
  requestId?: string;
  count: number;
}

export interface ProjectAccessDeniedEvent {
  projectId: string;
  workspaceId: string;
  userId: string;
  requestId?: string;
}

export interface ProjectLookupRateLimitedEvent {
  workspaceId: string;
  userId: string;
  requestId?: string;
}

export interface ProjectDeletedEvent {
  projectId: string;
  workspaceId: string;
  actorId: string;
  requestId?: string;
}

export interface ProjectMembersListTruncatedEvent {
  projectId: string;
  total: number;
  requestId?: string;
}

export abstract class ProjectEvents {
  abstract created(event: ProjectCreatedEvent): Promise<void>;
  abstract updated(event: ProjectUpdatedEvent): Promise<void>;
  abstract deleted(event: ProjectDeletedEvent): Promise<void>;
  abstract listTruncated(event: ProjectListTruncatedEvent): Promise<void>;
  abstract accessDenied(event: ProjectAccessDeniedEvent): Promise<void>;
  abstract lookupRateLimited(
    event: ProjectLookupRateLimitedEvent,
  ): Promise<void>;
  abstract membersListTruncated(
    event: ProjectMembersListTruncatedEvent,
  ): Promise<void>;
}
