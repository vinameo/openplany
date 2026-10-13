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
      switchToHttp: () => ({
        getRequest: () => ({ workspace: makeMemberWorkspace() }),
      }),
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

  it('allows admin through when workspace.settings.update is required, without logging warn', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const adminCtx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          workspace: makeMemberWorkspace({
            role: 'admin',
            permissions: ['workspace.settings.update'],
          }),
        }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(adminCtx)).toBe(true);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('throws 403 FORBIDDEN for member and guest, logging warn with required format and no PII/slug (AC-09)', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue('workspace.settings.update');
    const guard = new WorkspacePermissionGuard(reflector);

    const memberWs = makeMemberWorkspace({
      id: 'ws-uuid-1',
      name: 'Acme Secret Name',
      slug: 'acme-secret-slug',
      role: 'member',
      permissions: ['workspace.settings.view'],
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
          workspace: makeMemberWorkspace({
            role: 'guest',
            permissions: ['workspace.settings.view'],
          }),
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

  it('allows through when all permissions in an array are granted', () => {
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue([
      'workspace.members.view',
      'workspace.members.add',
    ]);
    const guard = new WorkspacePermissionGuard(reflector);

    const ctx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          workspace: makeMemberWorkspace({
            permissions: ['workspace.members.view', 'workspace.members.add'],
          }),
        }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws 403 FORBIDDEN when any permission in an array is missing', () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const reflector = new Reflector();
    vi.spyOn(reflector, 'get').mockReturnValue([
      'workspace.members.view',
      'workspace.members.add',
    ]);
    const guard = new WorkspacePermissionGuard(reflector);

    const ctx = {
      getHandler: () => () => {},
      switchToHttp: () => ({
        getRequest: () => ({
          workspace: makeMemberWorkspace({
            permissions: ['workspace.members.view'],
          }),
          auth: { userId: 'user-1' },
          requestId: 'req-1',
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(ctx)).toThrowError(
      expect.objectContaining({
        status: HttpStatus.FORBIDDEN,
        code: 'FORBIDDEN',
      }),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('permission=workspace.members.add'),
    );
    warnSpy.mockRestore();
  });

  it('AC-13: WorkspaceWrite rejects non-enforced permissions at typecheck time', () => {
    // @ts-expect-error workspace.delete is not an EnforcedWorkspacePermission
    WorkspaceWrite('workspace.delete');
    // @ts-expect-error workspace.delete is not an EnforcedWorkspacePermission in an array
    WorkspaceWrite(['workspace.members.view', 'workspace.delete']);
  });
});
