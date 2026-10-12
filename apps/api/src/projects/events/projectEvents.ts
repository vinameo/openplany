export interface ProjectCreatedEvent {
  projectId: string;
  workspaceId: string;
  actorId: string;
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

export abstract class ProjectEvents {
  abstract created(event: ProjectCreatedEvent): Promise<void>;
  abstract listTruncated(event: ProjectListTruncatedEvent): Promise<void>;
  abstract accessDenied(event: ProjectAccessDeniedEvent): Promise<void>;
  abstract lookupRateLimited(
    event: ProjectLookupRateLimitedEvent,
  ): Promise<void>;
}
