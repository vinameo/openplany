import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import type { EnforcedWorkspacePermission } from '@repo/contracts';
import {
  WRITE_LIMIT_KEY,
  type WriteLimit,
} from '../projects/access/writeLimit.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from './workspacePermissionGuard.js';
import { WorkspaceWriteRateLimitGuard } from './workspaceWriteRateLimitGuard.js';

export const WORKSPACE_PERMISSION_KEY = 'workspacePermission';

export type WorkspacePermissionRequirement =
  EnforcedWorkspacePermission | readonly EnforcedWorkspacePermission[];

export interface WorkspaceWriteOptions {
  writeLimit?: WriteLimit;
}

/** Every write under /api/workspaces/:slug uses this, so guard order is fixed in one place. */
export function WorkspaceWrite(
  permission: WorkspacePermissionRequirement,
  options?: WorkspaceWriteOptions,
): MethodDecorator {
  const decorators: (ClassDecorator | MethodDecorator | PropertyDecorator)[] = [
    SetMetadata(WORKSPACE_PERMISSION_KEY, permission),
  ];
  if (options?.writeLimit !== undefined) {
    decorators.push(SetMetadata(WRITE_LIMIT_KEY, options.writeLimit));
  }
  decorators.push(
    UseGuards(
      WorkspaceWriteRateLimitGuard,
      WorkspaceMemberGuard,
      WorkspacePermissionGuard,
    ),
  );
  return applyDecorators(...decorators);
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
