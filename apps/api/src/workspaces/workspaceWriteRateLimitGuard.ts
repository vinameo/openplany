import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Clock } from '../auth/clock.js';
import { ApiException } from '../common/apiException.js';
import { SlidingWindowLimiter } from '../common/slidingWindowLimiter.js';
import { WRITE_LIMIT_KEY, type WriteLimit } from '../common/writeLimit.js';
import { WORKSPACE_WRITE_LIMITER } from './tokens.js';

@Injectable()
export class WorkspaceWriteRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(WorkspaceWriteRateLimitGuard.name);

  constructor(
    @Inject(WORKSPACE_WRITE_LIMITER)
    private readonly defaultLimiter: SlidingWindowLimiter,
    private readonly clock: Clock,
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.auth?.userId;

    if (!userId) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', {
        key: 'errors:http.unauthenticated',
      });
    }

    const writeLimit = this.reflector.get<WriteLimit | undefined>(
      WRITE_LIMIT_KEY,
      context.getHandler(),
    );
    const limiter = writeLimit
      ? this.limiterFor(writeLimit)
      : this.defaultLimiter;

    const bucket = writeLimit?.bucket ?? 'workspace_write';
    const message = writeLimit?.message ?? {
      key: 'errors:tooManyWorkspaceWrites',
    };

    const decision = limiter.hit(userId, this.clock.now());
    if (!decision.allowed) {
      const shouldLog =
        !writeLimit?.logOncePerWindow || decision.firstBlockInWindow;
      if (shouldLog) {
        const eventName =
          writeLimit?.logEvent ?? 'workspace.write.rate_limited';
        this.logger.warn(
          `${eventName} userId=${userId} bucket=${bucket} requestId=${request.requestId ?? ''}`,
        );
      }
      throw new ApiException(
        HttpStatus.TOO_MANY_REQUESTS,
        'TOO_MANY_ATTEMPTS',
        message,
        { retryAfterSeconds: decision.retryAfterSeconds },
      );
    }

    return true;
  }

  private limiterFor(writeLimit: WriteLimit): SlidingWindowLimiter {
    try {
      return this.moduleRef.get<SlidingWindowLimiter>(writeLimit.limiterToken, {
        strict: false,
      });
    } catch (err: unknown) {
      // A route declares a writeLimit whose module does not provide its limiter: a wiring bug
      throw new Error(
        `No limiter provided for writeLimit bucket=${writeLimit.bucket}`,
        { cause: err },
      );
    }
  }
}
