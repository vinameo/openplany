import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  INSTANCE_ADMIN_DENIED_MESSAGE,
  InstanceAdminGuard,
} from './instanceAdminGuard.js';

function contextFor(request: Partial<Request>): ExecutionContext {
  return {
    getHandler: () => () => {},
    getClass: () => class {},
    switchToHttp: () => ({
      getRequest: () => request as Request,
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

describe('InstanceAdminGuard', () => {
  it('throws UNAUTHENTICATED when request.auth is undefined', () => {
    const guard = new InstanceAdminGuard();
    const context = contextFor({ requestId: 'req-1' });

    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        status: HttpStatus.UNAUTHORIZED,
        code: 'UNAUTHENTICATED',
        message: 'Sign in to continue',
      }),
    );
  });

  it('allows access when user is an instance admin', () => {
    const guard = new InstanceAdminGuard();
    const context = contextFor({
      auth: {
        userId: 'admin-1',
        isResetOnly: false,
        isInstanceAdmin: true,
      },
      requestId: 'req-1',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('logs warn and throws FORBIDDEN with default message when no metadata is set', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const guard = new InstanceAdminGuard();
    const context = contextFor({
      auth: {
        userId: 'user-1',
        isResetOnly: false,
        isInstanceAdmin: false,
      },
      requestId: 'req-42',
    });

    try {
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message: "You don't have permission to do this",
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith('admin.forbidden userId=user-1 requestId=req-42');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('throws FORBIDDEN with custom message when @InstanceAdminDeniedMessage metadata is set', () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    const reflector = new Reflector();
    const getAllAndOverrideSpy = vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(
      "You don't have permission to create users",
    );
    const guard = new InstanceAdminGuard(reflector);
    const context = contextFor({
      auth: {
        userId: 'user-1',
        isResetOnly: false,
        isInstanceAdmin: false,
      },
      requestId: 'req-42',
    });

    try {
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          status: HttpStatus.FORBIDDEN,
          code: 'FORBIDDEN',
          message: "You don't have permission to create users",
        }),
      );
      expect(getAllAndOverrideSpy).toHaveBeenCalledWith(
        INSTANCE_ADMIN_DENIED_MESSAGE,
        expect.any(Array),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
