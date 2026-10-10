import { Injectable, Logger } from '@nestjs/common';
import {
  EDITABLE_WORKSPACE_FIELDS,
  WORKSPACE_ROLES,
  type EditableWorkspaceField,
} from '@repo/contracts';
import {
  WorkspaceEvents,
  type MemberCandidatesSearchedEvent,
  type WorkspaceMembersAddedEvent,
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

  async memberCandidatesSearched(
    event: MemberCandidatesSearchedEvent,
  ): Promise<void> {
    this.logger.debug(
      `workspace.members.candidates requestId=${event.requestId} userId=${event.actorId} workspaceId=${event.workspaceId} resultCount=${event.resultCount}`,
    );
  }

  async membersAdded(event: WorkspaceMembersAddedEvent): Promise<void> {
    const rolesPart = WORKSPACE_ROLES.filter((r) => event.roles[r] !== undefined)
      .map((r) => `${r}:${event.roles[r]}`)
      .join(',');
    this.logger.log(
      `workspace.members.added requestId=${event.requestId} userId=${event.actorId} workspaceId=${event.workspaceId} role=${event.actorRole} count=${event.count} reactivated=${event.reactivatedCount} roles=${rolesPart}`,
    );
  }
}

