import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  Optional,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../common/apiException.js';

export const INSTANCE_ADMIN_DENIED_MESSAGE = 'instanceAdminDeniedMessage';
export const InstanceAdminDeniedMessage = (message: string) =>
  SetMetadata(INSTANCE_ADMIN_DENIED_MESSAGE, message);

@Injectable()
export class InstanceAdminGuard implements CanActivate {
  private readonly logger = new Logger(InstanceAdminGuard.name);

  constructor(@Optional() private readonly reflector?: Reflector) {}

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
      const message =
        this.reflector?.getAllAndOverride<string>(
          INSTANCE_ADMIN_DENIED_MESSAGE,
          [context.getHandler(), context.getClass()],
        ) ?? "You don't have permission to do this";

      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        message,
      );
    }
    return true;
  }
}
