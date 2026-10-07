import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { getAllowedOrigins } from '../../common/allowedOrigins.js';
import { ApiException } from '../../common/apiException.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence alongside SameSite=Lax: every state-changing request,
 * sign-in included (login CSRF), must come from an allowed Origin.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(config: ConfigService) {
    this.allowed = new Set(getAllowedOrigins(config));
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.header('Origin');
    if (origin !== undefined && this.allowed.has(origin)) return true;

    throw new ApiException(
      HttpStatus.FORBIDDEN,
      'ORIGIN_NOT_ALLOWED',
      'Request blocked',
    );
  }
}
