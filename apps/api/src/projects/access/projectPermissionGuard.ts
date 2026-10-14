import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { EnforcedProjectPermission } from '@repo/contracts';
import type { Request } from 'express';
import { ApiException } from '../../common/apiException.js';

export const PROJECT_PERMISSION_KEY = 'projectPermission';

/**
 * Checks one project permission against the viewer's project role, whose
 * permissions were read from role_permissions by ProjectAccessGuard.
 * Must run after ProjectAccessGuard.
 */
@Injectable()
export class ProjectPermissionGuard implements CanActivate {
  private readonly logger = new Logger(ProjectPermissionGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<EnforcedProjectPermission | undefined>(
      PROJECT_PERMISSION_KEY,
      context.getHandler(),
    );
    if (required === undefined) {
      throw new Error('ProjectPermissionGuard used without a permission');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const project = request.project;
    if (project === undefined) {
      throw new Error(
        'ProjectPermissionGuard must run after ProjectAccessGuard',
      );
    }
    if (!project.access.permissions.includes(required)) {
      this.logger.warn(
        `project.forbidden permission=${required} role=${project.access.role} ` +
          `projectId=${project.project.id} userId=${request.auth?.userId ?? ''} requestId=${request.requestId ?? ''}`,
      );
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        { key: 'errors:forbidden' },
      );
    }
    return true;
  }
}
