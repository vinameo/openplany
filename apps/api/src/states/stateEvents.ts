import { Injectable, Logger } from '@nestjs/common';

export interface StateCreatedEvent {
  workspaceId: string;
  projectId?: string;
  stateId: string;
  level: string;
  group: string;
  actorId: string;
  requestId?: string;
}

export interface StateUpdatedEvent {
  workspaceId: string;
  projectId?: string;
  stateId: string;
  level: string;
  group: string;
  actorId: string;
  changed: ('name' | 'group' | 'color')[];
  requestId?: string;
}

export interface StateDeletedEvent {
  workspaceId: string;
  projectId?: string;
  stateId: string;
  level: string;
  group: string;
  actorId: string;
  replacementStateId?: string;
  movedWorkItems: number;
  durationMs: number;
  requestId?: string;
}

export abstract class StateEvents {
  abstract created(event: StateCreatedEvent): void;
  abstract updated(event: StateUpdatedEvent): void;
  abstract deleted(event: StateDeletedEvent): void;
}

@Injectable()
export class LoggingStateEvents extends StateEvents {
  private readonly logger = new Logger('States');

  created(event: StateCreatedEvent): void {
    this.logger.log(
      JSON.stringify({
        event: 'state.created',
        workspaceId: event.workspaceId,
        ...(event.projectId !== undefined && { projectId: event.projectId }),
        stateId: event.stateId,
        level: event.level,
        group: event.group,
        actorId: event.actorId,
        requestId: event.requestId ?? '',
      }),
    );
  }

  updated(event: StateUpdatedEvent): void {
    this.logger.log(
      JSON.stringify({
        event: 'state.updated',
        workspaceId: event.workspaceId,
        ...(event.projectId !== undefined && { projectId: event.projectId }),
        stateId: event.stateId,
        level: event.level,
        group: event.group,
        actorId: event.actorId,
        changed: event.changed,
        requestId: event.requestId ?? '',
      }),
    );
  }

  deleted(event: StateDeletedEvent): void {
    this.logger.log(
      JSON.stringify({
        event: 'state.deleted',
        workspaceId: event.workspaceId,
        ...(event.projectId !== undefined && { projectId: event.projectId }),
        stateId: event.stateId,
        level: event.level,
        group: event.group,
        actorId: event.actorId,
        ...(event.replacementStateId !== undefined && {
          replacementStateId: event.replacementStateId,
        }),
        movedWorkItems: event.movedWorkItems,
        durationMs: event.durationMs,
        requestId: event.requestId ?? '',
      }),
    );
  }
}
