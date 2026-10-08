import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { makeMemberWorkspace } from '../../test/fakes/workspacesFakes.js';
import { WorkspacePermissionGuard } from './workspacePermissionGuard.js';

describe('WorkspacePermissionGuard', () => {
  it('throws an error if guard is used without permission metadata', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue(undefined);
    const guard = new WorkspacePermissionGuard(reflector);

    const ctx = {
      getHandler: () => () => {},
      switchToHttp: () => ({ getRequest: () => ({ workspace: makeMemberWorkspace() }) }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(
      'WorkspacePermissionGuard used without a permission',
    );
  });

  it('throws an error if request.workspace is missing', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const ctx = {
      getHandler: () => () => {},
      switchToHttp: () => ({ getRequest: () => ({ workspace: undefined }) }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrow(
      'WorkspacePermissionGuard must run after WorkspaceMemberGuard',
    );
  });

  it('allows owner and admin through when workspace.settings.update is required', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const ownerCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({ workspace: makeMemberWorkspace({ role: 'owner' }) }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ownerCtx)).toBe(true);

    const adminCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({ workspace: makeMemberWorkspace({ role: 'admin' }) }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(adminCtx)).toBe(true);
  });

  it('throws 403 FORBIDDEN for member and guest', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const memberCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({ workspace: makeMemberWorkspace({ role: 'member' }) }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(memberCtx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      }),
    );

    const guestCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({ workspace: makeMemberWorkspace({ role: 'guest' }) }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(guestCtx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      }),
    );
  });
});
