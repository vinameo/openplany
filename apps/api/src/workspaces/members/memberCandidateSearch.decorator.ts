import {
  applyDecorators,
  SetMetadata,
  type Type,
  type CanActivate,
  UseGuards,
} from '@nestjs/common';
import { WORKSPACE_PERMISSION_KEY } from '../workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../workspacePermissionGuard.js';
import { MemberCandidateRateLimitGuard } from './memberCandidateRateLimitGuard.js';

/** Rate limit tìm ứng viên chạy TRƯỚC kiểm thành viên/quyền: người không có quyền vẫn tốn lượt. */
export function withCandidateRateLimit(
  guards: readonly Type<CanActivate>[],
): Type<CanActivate>[] {
  return [MemberCandidateRateLimitGuard, ...guards];
}

export function WorkspaceMemberCandidateSearch(): MethodDecorator {
  return applyDecorators(
    SetMetadata(WORKSPACE_PERMISSION_KEY, 'workspace.members.add'),
    UseGuards(
      ...withCandidateRateLimit([
        WorkspaceMemberGuard,
        WorkspacePermissionGuard,
      ]),
    ),
  );
}
