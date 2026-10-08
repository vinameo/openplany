import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  workspacePermissionsOf,
  type WorkspacePermission,
} from '@repo/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/apiException.js';
import { WORKSPACE_PERMISSION_KEY } from './workspaceAccess.decorator.js';

@Injectable()
export class WorkspacePermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<WorkspacePermission | undefined>(
      WORKSPACE_PERMISSION_KEY,
      context.getHandler(),
    );
    if (required === undefined) {
      throw new Error('WorkspacePermissionGuard used without a permission');
    }
    const request = context.switchToHttp().getRequest<Request>();
    const workspace = request.workspace;
    if (workspace === undefined) {
      throw new Error(
        'WorkspacePermissionGuard must run after WorkspaceMemberGuard',
      );
    }
    if (!workspacePermissionsOf(workspace.role).includes(required)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        "You don't have permission to do this",
      );
    }
    return true;
  }
}

