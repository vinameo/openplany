import type {
  EditableWorkspaceField,
  WorkspaceResponse,
  WorkspaceRole,
} from '@repo/contracts';

export interface WorkspaceUpdatedEvent {
  workspaceId: string;
  actorId: string;
  actorRole: WorkspaceRole;
  occurredAt: Date;
  requestId?: string;
  changes: {
    [K in EditableWorkspaceField]?: {
      from: WorkspaceResponse[K];
      to: WorkspaceResponse[K];
    };
  };
}

export abstract class WorkspaceEvents {
  abstract updated(event: WorkspaceUpdatedEvent): Promise<void>;
}

