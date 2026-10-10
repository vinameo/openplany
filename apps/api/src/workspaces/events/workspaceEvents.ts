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

export interface MemberCandidatesSearchedEvent {
  workspaceId: string;
  actorId: string;
  requestId: string;
  resultCount: number;
}

export interface WorkspaceMembersAddedEvent {
  workspaceId: string;
  actorId: string;
  actorRole: WorkspaceRole;
  requestId: string;
  occurredAt: Date;
  count: number;
  reactivatedCount: number;
  roles: Partial<Record<WorkspaceRole, number>>;
}

export abstract class WorkspaceEvents {
  abstract updated(event: WorkspaceUpdatedEvent): Promise<void>;
  abstract memberCandidatesSearched(
    event: MemberCandidatesSearchedEvent,
  ): Promise<void>;
  abstract membersAdded(event: WorkspaceMembersAddedEvent): Promise<void>;
}

