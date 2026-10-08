import { Injectable, Logger } from '@nestjs/common';
import {
  EDITABLE_WORKSPACE_FIELDS,
  type EditableWorkspaceField,
} from '@repo/contracts';
import {
  WorkspaceEvents,
  type WorkspaceUpdatedEvent,
} from './workspaceEvents.js';

@Injectable()
export class LoggingWorkspaceEvents extends WorkspaceEvents {
  private readonly logger = new Logger(LoggingWorkspaceEvents.name);

  async updated(event: WorkspaceUpdatedEvent): Promise<void> {
    const changedFields = EDITABLE_WORKSPACE_FIELDS.filter(
      (field: EditableWorkspaceField) => field in event.changes,
    );

    const parts: string[] = [
      `workspace.updated`,
      `requestId=${event.requestId ?? ''}`,
      `userId=${event.actorId}`,
      `workspaceId=${event.workspaceId}`,
      `role=${event.actorRole}`,
      `changedFields=${changedFields.join(',')}`,
    ];

    if (event.changes.organizationSize) {
      parts.push(
        `organizationSizeFrom=${event.changes.organizationSize.from}`,
        `organizationSizeTo=${event.changes.organizationSize.to}`,
      );
    }

    if (event.changes.timezone) {
      parts.push(
        `timezoneFrom=${event.changes.timezone.from}`,
        `timezoneTo=${event.changes.timezone.to}`,
      );
    }

    this.logger.log(parts.join(' '));
  }
}

