import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../auth/clock.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { PROJECT_ROLE_FORBIDDEN_ALERT_LIMITER } from '../tokens.js';
import {
  ProjectEvents,
  type ProjectAccessDeniedEvent,
  type ProjectAddRoleForbiddenEvent,
  type ProjectCreatedEvent,
  type ProjectDeletedEvent,
  type ProjectListTruncatedEvent,
  type ProjectLookupRateLimitedEvent,
  type ProjectMemberCandidatesSearchedEvent,
  type ProjectMemberRoleChangedEvent,
  type ProjectMemberRoleForbiddenEvent,
  type ProjectMembersAddedEvent,
  type ProjectMembersListTruncatedEvent,
  type ProjectUpdatedEvent,
} from './projectEvents.js';

@Injectable()
export class LoggingProjectEvents extends ProjectEvents {
  private readonly logger = new Logger(LoggingProjectEvents.name);

  constructor(
    @Inject(PROJECT_ROLE_FORBIDDEN_ALERT_LIMITER)
    private readonly forbiddenAlertLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
  ) {
    super();
  }

  async created(event: ProjectCreatedEvent): Promise<void> {
    this.logger.log(
      `project.created projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} requestId=${event.requestId ?? ''}`,
    );
  }

  async updated(event: ProjectUpdatedEvent): Promise<void> {
    this.logger.log(
      `project.updated projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} fields=${event.fields.join(',')} requestId=${event.requestId ?? ''}`,
    );
  }

  async deleted(event: ProjectDeletedEvent): Promise<void> {
    this.logger.log(
      `project.deleted projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} requestId=${event.requestId ?? ''}`,
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

  async lookupRateLimited(event: ProjectLookupRateLimitedEvent): Promise<void> {
    this.logger.warn(
      `project.lookup.rate_limited workspaceId=${event.workspaceId} userId=${event.userId} requestId=${event.requestId ?? ''}`,
    );
  }

  async membersListTruncated(
    event: ProjectMembersListTruncatedEvent,
  ): Promise<void> {
    this.logger.warn(
      `project.members.list.truncated projectId=${event.projectId} source=${event.source} total=${event.total} requestId=${event.requestId ?? ''}`,
    );
  }

  async memberCandidatesSearched(
    event: ProjectMemberCandidatesSearchedEvent,
  ): Promise<void> {
    this.logger.debug(
      `project.members.candidates projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} mode=${event.mode} resultCount=${event.resultCount} requestId=${event.requestId ?? ''}`,
    );
  }

  async membersAdded(event: ProjectMembersAddedEvent): Promise<void> {
    this.logger.log(
      `project.members.added projectId=${event.projectId} workspaceId=${event.workspaceId} actorId=${event.actorId} actorRole=${event.actorRole ?? 'none'} count=${event.count} reactivatedCount=${event.reactivatedCount} roles=${event.roles.join(',')} requestId=${event.requestId ?? ''}`,
    );
  }

  async addRoleForbidden(event: ProjectAddRoleForbiddenEvent): Promise<void> {
    this.logger.warn(
      `project.members.add.role_forbidden projectId=${event.projectId} actorId=${event.actorId} requestId=${event.requestId ?? ''}`,
    );
  }

  async roleChanged(event: ProjectMemberRoleChangedEvent): Promise<void> {
    this.logger.log(
      `project.member.role.changed projectId=${event.projectId} actorId=${event.actorId} targetId=${event.targetId} fromRole=${event.fromRole} toRole=${event.toRole} requestId=${event.requestId ?? ''}`,
    );
  }

  async roleForbidden(event: ProjectMemberRoleForbiddenEvent): Promise<void> {
    // Any project member can trigger this; one line per actor and window (API B6).
    if (
      !this.forbiddenAlertLimiter.hit(event.actorId, this.clock.now()).allowed
    ) {
      return;
    }
    this.logger.warn(
      `project.member.role.forbidden projectId=${event.projectId} actorId=${event.actorId} targetId=${event.targetId} requestId=${event.requestId ?? ''}`,
    );
  }
}
