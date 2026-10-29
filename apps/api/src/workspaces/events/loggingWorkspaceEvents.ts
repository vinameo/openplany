import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EDITABLE_WORKSPACE_FIELDS,
  WORKSPACE_ROLES,
  type EditableWorkspaceField,
} from '@repo/contracts';
import {
  WorkspaceEvents,
  type MemberCandidatesSearchedEvent,
  type WorkspaceMemberRoleChangedEvent,
  type WorkspaceMemberRoleForbiddenEvent,
  type WorkspaceMemberRoleLastAdminEvent,
  type WorkspaceMembersAddedEvent,
  type WorkspaceUpdatedEvent,
} from './workspaceEvents.js';
import { Clock } from '../../auth/clock.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { ROLE_FORBIDDEN_ALERT_LIMITER } from '../tokens.js';

@Injectable()
export class LoggingWorkspaceEvents extends WorkspaceEvents {
  private readonly logger = new Logger(LoggingWorkspaceEvents.name);

  constructor(
    @Inject(ROLE_FORBIDDEN_ALERT_LIMITER)
    private readonly forbiddenAlertLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
  ) {
    super();
  }

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
    const rolesPart = WORKSPACE_ROLES.filter(
      (r) => event.roles[r] !== undefined,
    )
      .map((r) => `${r}:${event.roles[r]}`)
      .join(',');
    this.logger.log(
      `workspace.members.added requestId=${event.requestId} userId=${event.actorId} workspaceId=${event.workspaceId} role=${event.actorRole} count=${event.count} reactivated=${event.reactivatedCount} roles=${rolesPart}`,
    );
  }

  async memberRoleChanged(
    event: WorkspaceMemberRoleChangedEvent,
  ): Promise<void> {
    this.logger.log(
      `workspace.member.role.changed requestId=${event.requestId ?? ''} workspaceId=${event.workspaceId} actorId=${event.actorId} targetId=${event.targetId} fromRole=${event.fromRole} toRole=${event.toRole} effect=${event.effect} appliedProjectCount=${event.appliedProjectCount}`,
    );
  }

  async memberRoleForbidden(
    event: WorkspaceMemberRoleForbiddenEvent,
  ): Promise<void> {
    // Any member can trigger this; one line per actor and window (API B7).
    if (
      !this.forbiddenAlertLimiter.hit(event.actorId, this.clock.now()).allowed
    ) {
      return;
    }
    this.logger.warn(
      `workspace.member.role.forbidden requestId=${event.requestId ?? ''} workspaceId=${event.workspaceId} actorId=${event.actorId} targetId=${event.targetId}`,
    );
  }

  async memberRoleLastAdmin(
    event: WorkspaceMemberRoleLastAdminEvent,
  ): Promise<void> {
    this.logger.warn(
      `workspace.member.role.last_admin requestId=${event.requestId ?? ''} workspaceId=${event.workspaceId} actorId=${event.actorId} targetId=${event.targetId}`,
    );
  }
}
