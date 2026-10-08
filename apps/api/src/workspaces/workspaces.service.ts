import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  EDITABLE_WORKSPACE_FIELDS,
  pickChangedFields,
  pickWorkspaceColor,
  workspaceSlugProblem,
  type SlugCheckResponse,
  type WorkspaceListResponse,
  type WorkspaceResponse,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import type { CreateWorkspaceDto } from './dto/createWorkspace.dto.js';
import type { UpdateWorkspaceDto } from './dto/updateWorkspace.dto.js';
import { toWorkspaceResponse } from './dto/workspaceResponse.dto.js';
import {
  WorkspaceEvents,
  type WorkspaceUpdatedEvent,
} from './events/workspaceEvents.js';
import {
  type MemberWorkspace,
  SlugAlreadyExistsError,
  WorkspacesRepository,
  type WorkspaceChanges,
} from './repositories/workspaces.repository.js';
import { SLUG_CHECK_LIMITER } from './tokens.js';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    @Inject(SLUG_CHECK_LIMITER)
    private readonly slugCheckRateLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
    private readonly workspaceEvents: WorkspaceEvents,
  ) {}

  async checkSlug(
    userId: string,
    slug: string,
    requestId?: string,
  ): Promise<SlugCheckResponse> {
    const rateCheck = this.slugCheckRateLimiter.hit(userId, this.clock.now());
    if (!rateCheck.allowed) {
      this.logger.warn(
        `workspace.slug_check.rate_limited userId=${userId} requestId=${requestId ?? ''}`,
      );
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        "You've checked several URLs recently. Try again later.",
        { retryAfterSeconds: rateCheck.retryAfterSeconds },
      );
    }

    const problem = workspaceSlugProblem(slug);
    if (problem === 'INVALID') {
      return { slug, available: false, reason: 'INVALID' };
    }
    if (problem === 'RESERVED') {
      return { slug, available: false, reason: 'RESERVED' };
    }

    const exists = await this.workspacesRepository.slugExists(slug);
    if (exists) {
      return { slug, available: false, reason: 'TAKEN' };
    }

    return { slug, available: true, reason: null };
  }

  async create(
    userId: string,
    dto: CreateWorkspaceDto,
    requestId?: string,
  ): Promise<WorkspaceResponse> {
    const id = randomUUID();
    const backgroundColor = pickWorkspaceColor(id);
    const now = this.clock.now();

    try {
      const result = await this.workspacesRepository.create(
        userId,
        {
          id,
          name: dto.name,
          slug: dto.slug,
          organizationSize: dto.organizationSize,
          backgroundColor,
        },
        now,
      );

      if (result.status === 'rate_limited') {
        throw new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          'TOO_MANY_ATTEMPTS',
          "You've created several workspaces recently. Try again later.",
          { retryAfterSeconds: result.retryAfterSeconds },
        );
      }

      if (result.status === 'user_inactive') {
        throw new ApiException(
          HttpStatus.UNAUTHORIZED,
          'UNAUTHENTICATED',
          'Sign in to continue',
        );
      }

      // Security & privacy: do not log workspace name or slug
      this.logger.log(
        `workspace.created userId=${userId} workspaceId=${id} organizationSize=${dto.organizationSize} requestId=${requestId ?? ''}`,
      );

      return toWorkspaceResponse(result.workspace);
    } catch (err: unknown) {
      if (err instanceof SlugAlreadyExistsError) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          'SLUG_ALREADY_EXISTS',
          'This URL is already taken. Choose another one.',
          {
            fields: {
              slug: 'This URL is already taken. Choose another one.',
            },
          },
        );
      }
      throw err;
    }
  }

  async listForMember(userId: string): Promise<WorkspaceListResponse> {
    const { workspaces, lastWorkspaceId } =
      await this.workspacesRepository.listForMember(userId);

    const mapped = workspaces.map(toWorkspaceResponse);
    const lastWorkspace = workspaces.find((w) => w.id === lastWorkspaceId);

    return {
      workspaces: mapped,
      lastWorkspaceSlug: lastWorkspace?.slug ?? null,
    };
  }

  async rememberLastWorkspace(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    try {
      await this.workspacesRepository.rememberLastWorkspace(userId, workspaceId);
    } catch (err: unknown) {
      this.logger.warn(
        `workspace.remember_last_failed userId=${userId} workspaceId=${workspaceId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async update(
    workspace: MemberWorkspace,
    actorId: string,
    dto: UpdateWorkspaceDto,
    requestId?: string,
  ): Promise<WorkspaceResponse> {
    const requested: WorkspaceChanges = {};
    if (dto.name !== undefined) requested.name = dto.name;
    if (dto.organizationSize !== undefined) requested.organizationSize = dto.organizationSize;
    if (dto.timezone !== undefined) requested.timezone = dto.timezone;

    if (Object.keys(requested).length === 0) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        'Nothing to update',
      );
    }

    const changes = pickChangedFields(
      workspace,
      requested,
      EDITABLE_WORKSPACE_FIELDS,
    );

    if (Object.keys(changes).length === 0) {
      return toWorkspaceResponse(workspace);
    }

    const eventChanges: WorkspaceUpdatedEvent['changes'] = {};
    if (changes.name !== undefined) {
      eventChanges.name = {
        from: workspace.name,
        to: changes.name,
      };
    }
    if (changes.organizationSize !== undefined) {
      eventChanges.organizationSize = {
        from: workspace.organizationSize,
        to: changes.organizationSize,
      };
    }
    if (changes.timezone !== undefined) {
      eventChanges.timezone = {
        from: workspace.timezone,
        to: changes.timezone,
      };
    }

    const saved = await this.workspacesRepository.update(
      workspace.id,
      actorId,
      changes,
      this.clock.now(),
    );

    if (saved === null) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Workspace not found',
      );
    }

    const updated: MemberWorkspace = {
      ...workspace,
      ...changes,
      updatedAt: saved.updatedAt,
    };

    try {
      await this.workspaceEvents.updated({
        workspaceId: workspace.id,
        actorId,
        actorRole: workspace.role,
        occurredAt: saved.updatedAt,
        requestId,
        changes: eventChanges,
      });
    } catch (err: unknown) {
      this.logger.error(
        `workspace.updated.event_failed workspaceId=${workspace.id} actorId=${actorId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return toWorkspaceResponse(updated);
  }
}
