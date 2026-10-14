import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import {
  PROJECT_ERROR_MESSAGE_REFS,
  PROJECT_IDENTIFIER_PATTERN,
} from '@repo/contracts';
import type { Request } from 'express';
import { Clock } from '../../auth/clock.js';
import { ApiException } from '../../common/apiException.js';
import { SlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { ProjectEvents } from '../events/projectEvents.js';
import {
  PROJECT_LOOKUP_ALERT_LIMITER,
  PROJECT_LOOKUP_LIMITER,
} from '../tokens.js';
import {
  ProjectAccessResolver,
  type AccessibleProject,
  type ProjectLookup,
} from './projectAccessResolver.js';

declare module 'express-serve-static-core' {
  interface Request {
    project?: AccessibleProject;
  }
}

/** Every project-scoped route names its Project ID parameter this way. */
export const PROJECT_ROUTE_PARAM = 'identifier';

/**
 * Opens the project named by `:identifier` for the current workspace member
 * (RQ D11): 404 when it does not exist, 403 when the member cannot access it.
 * Failed lookups are rate limited per user; past the limit every miss answers
 * 429, so 403 and 404 can no longer be told apart (BA BR1).
 * Must run after WorkspaceMemberGuard.
 */
@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly resolver: ProjectAccessResolver,
    private readonly events: ProjectEvents,
    @Inject(PROJECT_LOOKUP_LIMITER)
    private readonly limiter: SlidingWindowLimiter,
    @Inject(PROJECT_LOOKUP_ALERT_LIMITER)
    private readonly alertLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const workspace = request.workspace;
    const userId = request.auth?.userId;
    if (workspace === undefined || userId === undefined) {
      throw new Error('ProjectAccessGuard must run after WorkspaceMemberGuard');
    }
    const identifier: unknown = request.params?.[PROJECT_ROUTE_PARAM];
    if (typeof identifier !== 'string') {
      throw new Error(
        `ProjectAccessGuard used on a route without :${PROJECT_ROUTE_PARAM}`,
      );
    }

    const lookup: ProjectLookup = PROJECT_IDENTIFIER_PATTERN.test(identifier)
      ? await this.resolver.forIdentifier({
          workspaceId: workspace.id,
          userId,
          workspaceRole: workspace.role,
          identifier,
        })
      : { kind: 'not_found' };

    if (lookup.kind === 'accessible') {
      request.project = lookup.project;
      return true;
    }

    await this.throttleFailedLookup(workspace.id, userId, request.requestId);

    if (lookup.kind === 'forbidden') {
      await this.events.accessDenied({
        projectId: lookup.projectId,
        workspaceId: workspace.id,
        userId,
        requestId: request.requestId,
      });
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        PROJECT_ERROR_MESSAGE_REFS.forbidden,
      );
    }
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      'PROJECT_NOT_FOUND',
      PROJECT_ERROR_MESSAGE_REFS.notFound,
    );
  }

  private async throttleFailedLookup(
    workspaceId: string,
    userId: string,
    requestId: string | undefined,
  ): Promise<void> {
    const now = this.clock.now();
    const decision = this.limiter.hit(userId, now);
    if (decision.allowed) return;

    if (this.alertLimiter.hit(userId, now).allowed) {
      await this.events.lookupRateLimited({ workspaceId, userId, requestId });
    }
    throw new ApiException(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_ATTEMPTS',
      { key: 'errors:tooManyAttempts' },
      { retryAfterSeconds: decision.retryAfterSeconds },
    );
  }
}
