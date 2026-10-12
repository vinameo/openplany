import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { EnforcedProjectPermission } from '@repo/contracts';
import type { Request } from 'express';
import { WorkspaceMemberGuard } from '../../workspaces/workspaceMemberGuard.js';
import { WorkspaceWriteRateLimitGuard } from '../../workspaces/workspaceWriteRateLimitGuard.js';
import { ProjectAccessGuard } from './projectAccessGuard.js';
import type { AccessibleProject } from './projectAccessResolver.js';
import {
  PROJECT_PERMISSION_KEY,
  ProjectPermissionGuard,
} from './projectPermissionGuard.js';

/**
 * Every read under /api/workspaces/:slug/projects/:identifier uses this, so
 * the project access check (and its guard order) lives in one place.
 * Without a permission, any viewer who can access the project passes.
 */
export function ProjectRead(
  permission?: EnforcedProjectPermission,
): MethodDecorator {
  return permission === undefined
    ? applyDecorators(UseGuards(WorkspaceMemberGuard, ProjectAccessGuard))
    : applyDecorators(
        SetMetadata(PROJECT_PERMISSION_KEY, permission),
        UseGuards(
          WorkspaceMemberGuard,
          ProjectAccessGuard,
          ProjectPermissionGuard,
        ),
      );
}

/** Every write under /api/workspaces/:slug/projects/:identifier uses this. */
export function ProjectWrite(
  permission: EnforcedProjectPermission,
): MethodDecorator {
  return applyDecorators(
    SetMetadata(PROJECT_PERMISSION_KEY, permission),
    UseGuards(
      WorkspaceWriteRateLimitGuard,
      WorkspaceMemberGuard,
      ProjectAccessGuard,
      ProjectPermissionGuard,
    ),
  );
}

/** The project opened by ProjectAccessGuard (via ProjectRead / ProjectWrite). */
export const CurrentProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AccessibleProject => {
    const project = ctx.switchToHttp().getRequest<Request>().project;
    if (project === undefined) {
      throw new Error('CurrentProject used on a route without ProjectRead/ProjectWrite');
    }
    return project;
  },
);
