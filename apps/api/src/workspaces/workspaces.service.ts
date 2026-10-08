import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  pickWorkspaceColor,
  workspaceSlugProblem,
  type SlugCheckResponse,
  type WorkspaceListResponse,
  type WorkspaceResponse,
} from '@repo/contracts';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import type { CreateWorkspaceDto } from './dto/createWorkspace.dto.js';
import { toWorkspaceResponse } from './dto/workspaceResponse.dto.js';
import {
  SlugAlreadyExistsError,
  WorkspacesRepository,
} from './repositories/workspaces.repository.js';
import { SlugCheckRateLimiter } from './slugCheckRateLimiter.js';

@Injectable()
export class WorkspacesService {
  private readonly logger = new Logger(WorkspacesService.name);

  constructor(
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly slugCheckRateLimiter: SlugCheckRateLimiter,
    private readonly clock: Clock,
  ) {}

  async checkSlug(
    userId: string,
    slug: string,
    requestId?: string,
  ): Promise<SlugCheckResponse> {
    const rateCheck = this.slugCheckRateLimiter.check(userId, this.clock.now());
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
}
