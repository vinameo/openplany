import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { EnforcedWorkspacePermission } from '@repo/contracts';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from './workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from './workspaceWriteRateLimitGuard.js';

export const WORKSPACE_PERMISSION_KEY = 'workspacePermission';

export type WorkspacePermissionRequirement =
  EnforcedWorkspacePermission | readonly EnforcedWorkspacePermission[];

/** Every write under /api/workspaces/:slug uses this, so guard order is fixed in one place. */
export function WorkspaceWrite(
  permission: WorkspacePermissionRequirement,
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

/** Endpoint đọc dưới /api/workspaces/:slug cần một hoặc nhiều quyền. Không có giới hạn ghi. */
export function WorkspaceRead(
  permission: WorkspacePermissionRequirement,
): MethodDecorator {
  return applyDecorators(
    SetMetadata(WORKSPACE_PERMISSION_KEY, permission),
    UseGuards(WorkspaceMemberGuard, WorkspacePermissionGuard),
  );
}
