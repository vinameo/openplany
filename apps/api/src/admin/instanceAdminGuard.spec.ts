import { type ExecutionContext, HttpStatus, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { InstanceAdminGuard } from './instanceAdminGuard.js';

function contextFor(request: Partial<Request>): ExecutionContext {
  return {
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

  it('logs warn and throws FORBIDDEN when user is not an instance admin', () => {
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
          message: "You don't have permission to create users",
        }),
      );
      expect(warnSpy).toHaveBeenCalledWith('admin.forbidden userId=user-1 requestId=req-42');
    } finally {
      warnSpy.mockRestore();
    }
  });
});
