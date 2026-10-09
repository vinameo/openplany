import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { EnforcedWorkspacePermission } from '@repo/contracts';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from './workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from './workspaceWriteRateLimitGuard.js';

export const WORKSPACE_PERMISSION_KEY = 'workspacePermission';

/** Every write under /api/workspaces/:slug uses this, so guard order is fixed in one place. */
export function WorkspaceWrite(
  permission: EnforcedWorkspacePermission,
): MethodDecorator {
  return applyDecorators(
    SetMetadata(WORKSPACE_PERMISSION_KEY, permission),
    UseGuards(
      WorkspaceWriteRateLimitGuard,
      WorkspaceMemberGuard,
      WorkspacePermissionGuard,
    ),
  );
}

