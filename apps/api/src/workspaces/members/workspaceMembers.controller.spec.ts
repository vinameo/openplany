import { describe, expect, it } from 'vitest';
import { WorkspaceMembersController } from './workspaceMembers.controller.js';
import { MemberCandidateRateLimitGuard } from './memberCandidateRateLimitGuard.js';
import { WorkspaceMemberGuard } from '../workspaceMemberGuard.js';
import { WorkspacePermissionGuard } from '../workspacePermissionGuard.js';

describe('WorkspaceMembersController', () => {
  const candidatesFn = Object.getOwnPropertyDescriptor(
    WorkspaceMembersController.prototype,
    'candidates',
  )?.value as object;

  const addFn = Object.getOwnPropertyDescriptor(
    WorkspaceMembersController.prototype,
    'add',
  )?.value as object;

  it('API-21: guards on candidate search endpoint are in correct order', () => {
    const guards = Reflect.getMetadata('__guards__', candidatesFn);

    expect(guards).toBeDefined();
    // Verify MemberCandidateRateLimitGuard runs before WorkspaceMemberGuard and WorkspacePermissionGuard
    const rateLimitIdx = guards.indexOf(MemberCandidateRateLimitGuard);
    const memberIdx = guards.indexOf(WorkspaceMemberGuard);
    const permIdx = guards.indexOf(WorkspacePermissionGuard);

    expect(rateLimitIdx).toBeGreaterThanOrEqual(0);
    expect(memberIdx).toBeGreaterThanOrEqual(0);
    expect(permIdx).toBeGreaterThanOrEqual(0);
    expect(rateLimitIdx).toBeLessThan(memberIdx);
    expect(memberIdx).toBeLessThan(permIdx);
  });

  it('verifies guards and permission on add members endpoint', () => {
    const guards = Reflect.getMetadata('__guards__', addFn);
    const perm = Reflect.getMetadata('workspacePermission', addFn);

    expect(perm).toBe('workspace.members.add');
    expect(guards).toBeDefined();
    expect(guards.length).toBe(3);
  });
});
