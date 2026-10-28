import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { WRITE_LIMIT_KEY, type WriteLimit } from '../projects/access/writeLimit.js';
import { WORKSPACE_WRITE_LIMITER } from './tokens.js';

@Injectable()
export class WorkspaceWriteRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceWriteRateLimitGuard.name);

  constructor(
    @Inject(WORKSPACE_WRITE_LIMITER)
    private readonly defaultLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
    @Optional()
    private readonly reflector?: Reflector,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.auth?.userId;

    if (!userId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        { key: 'errors:http.unauthenticated' },
      );
    }

    const handler = context.getHandler?.();
    const writeLimit =
      handler && this.reflector
        ? this.reflector.get<WriteLimit | undefined>(WRITE_LIMIT_KEY, handler)
        : undefined;

    let limiter = this.defaultLimiter;
    if (writeLimit && this.moduleRef) {
      limiter = this.moduleRef.get<SlidingWindowLimiter>(
        writeLimit.limiterToken,
        { strict: false },
      );
    }

    const bucket = writeLimit?.bucket ?? 'workspace_write';
    const message = writeLimit?.message ?? {
      key: 'errors:tooManyWorkspaceWrites',
    };

    const decision = limiter.hit(userId, this.clock.now());
    if (!decision.allowed) {
      this.logger.warn(
        `workspace.write.rate_limited userId=${userId} bucket=${bucket} requestId=${request.requestId ?? ''}`,
      );
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        message,
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    return true;
  }
}
