import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { makeMemberWorkspace } from '../../test/fakes/workspacesFakes.js';
import { WorkspaceWrite } from './workspaceAccess.decorator.js';
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

  it('allows owner and admin through when workspace.settings.update is required, without logging warn', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
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

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('throws 403 FORBIDDEN for member and guest, logging warn with required format and no PII/slug (AC-09)', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const memberWs = makeMemberWorkspace({
      id: 'ws-uuid-1',
      name: 'Acme Secret Name',
      slug: 'acme-secret-slug',
      role: 'member',
    });

    const memberCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          workspace: memberWs,
          auth: { userId: 'user-uuid-1' },
          requestId: 'req-id-1',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(memberCtx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      }),
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logMessage = warnSpy.mock.calls[0]![0] as string;
    expect(logMessage).toBe(
      'workspace.forbidden permission=workspace.settings.update role=member workspaceId=ws-uuid-1 userId=user-uuid-1 requestId=req-id-1',
    );
    expect(logMessage).not.toContain('acme-secret-slug');
    expect(logMessage).not.toContain('Acme Secret Name');

    const guestCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          workspace: makeMemberWorkspace({ role: 'guest' }),
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(guestCtx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      }),
    );

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('AC-13: WorkspaceWrite rejects non-enforced permissions at typecheck time', () => {
    // @ts-expect-error workspace.delete is not an EnforcedWorkspacePermission
    WorkspaceWrite('workspace.delete');
  });
});
