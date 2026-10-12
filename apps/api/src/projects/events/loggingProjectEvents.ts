import { Injectable, Logger } from '@nestjs/common';
import {
  ProjectEvents,
  type ProjectAccessDeniedEvent,
  type ProjectCreatedEvent,
  type ProjectListTruncatedEvent,
} from './projectEvents.js';

@Injectable()
export class LoggingProjectEvents extends ProjectEvents {
  private readonly logger = new Logger(LoggingProjectEvents.name);

  async created(event: ProjectCreatedEvent): Promise<void> {
    this.logger.log(
      `project.created projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} requestId=${event.requestId ?? ''}`,
    );
  }

  async listTruncated(event: ProjectListTruncatedEvent): Promise<void> {
    this.logger.warn(
      `project.list.truncated workspaceId=${event.workspaceId} userId=${event.userId} requestId=${event.requestId ?? ''} count=${event.count}`,
    );
  }

  async accessDenied(event: ProjectAccessDeniedEvent): Promise<void> {
    this.logger.log(
      `project.access_denied projectId=${event.projectId} workspaceId=${event.workspaceId} userId=${event.userId} requestId=${event.requestId ?? ''}`,
    );
  }
}
