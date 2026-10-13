import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it } from 'vitest';
import { WORKSPACE_PERMISSION_KEY } from '../workspaceAccess.decorator.js';
import { WorkspaceMemberGuard } from '../workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../workspacePermissionGuard.js';
import { MemberCandidateRateLimitGuard } from './memberCandidateRateLimitGuard.js';
import {
  WorkspaceMemberCandidateSearch,
  withCandidateRateLimit,
} from './memberCandidateSearch.decorator.js';

describe('memberCandidateSearch decorators', () => {
  it('withCandidateRateLimit prepends MemberCandidateRateLimitGuard', () => {
    const guards = withCandidateRateLimit([
      WorkspaceMemberGuard,
      WorkspacePermissionGuard,
    ]);
    expect(guards).toEqual([
      MemberCandidateRateLimitGuard,
      WorkspaceMemberGuard,
      WorkspacePermissionGuard,
    ]);
  });

  it('WorkspaceMemberCandidateSearch attaches permission metadata and ordered guards', () => {
    class TestController {
      @WorkspaceMemberCandidateSearch()
      search() {}
    }

    const handler = Object.getOwnPropertyDescriptor(
      TestController.prototype,
      'search',
    )?.value as object;
    const permission = Reflect.getMetadata(WORKSPACE_PERMISSION_KEY, handler);
    const guards = Reflect.getMetadata(GUARDS_METADATA, handler);

    expect(permission).toBe('workspace.members.add');
    expect(guards).toEqual([
      MemberCandidateRateLimitGuard,
      WorkspaceMemberGuard,
      WorkspacePermissionGuard,
    ]);
  });
});
