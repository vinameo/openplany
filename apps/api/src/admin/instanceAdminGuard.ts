import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiException } from '../common/apiException.js';

@Injectable()
export class InstanceAdminGuard implements CanActivate {
  private readonly logger = new Logger(InstanceAdminGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const auth = request.auth;
    if (auth === undefined) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Sign in to continue',
      );
    }
    if (!auth.isInstanceAdmin) {
      this.logger.warn(
        `admin.forbidden userId=${auth.userId} requestId=${request.requestId}`,
      );
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        "You don't have permission to create users",
      );
    }
    return true;
  }
}

