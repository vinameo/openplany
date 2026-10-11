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

export abstract class ProjectEvents {
  abstract created(event: ProjectCreatedEvent): Promise<void>;
  abstract listTruncated(event: ProjectListTruncatedEvent): Promise<void>;
}
