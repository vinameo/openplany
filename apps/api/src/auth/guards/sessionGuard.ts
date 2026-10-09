import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { ApiException } from '../../common/apiException.js';
import { AuthService } from '../auth.service.js';
import { ALLOW_RESET_ONLY_KEY } from '../currentUser.decorator.js';
import { SessionCookie } from '../sessionCookie.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { userId: string; isResetOnly: boolean; isInstanceAdmin: boolean };
  }
}

/**
 * Requires a live session cookie. A reset-only session (password change
 * pending) is refused unless the handler opts in with @AllowResetOnlySession().
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookie: SessionCookie,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const token = this.sessionCookie.read(request);
    const result =
      token === null ? null : await this.authService.getSession(token);
    if (token === null || result === null) {
      if (token !== null) this.sessionCookie.clear(response);
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Sign in to continue',
      );
    }
    if (result.renewedMaxAgeMs !== null) {
      this.sessionCookie.set(response, token, result.renewedMaxAgeMs);
    }

    const isResetOnly = result.body.requiresPasswordReset;
    const allowsResetOnly = this.reflector.getAllAndOverride<boolean>(
      ALLOW_RESET_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isResetOnly && allowsResetOnly !== true) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        'PASSWORD_RESET_REQUIRED',
        'Set a new password to continue',
      );
    }

    request.auth = {
      userId: result.body.user.id,
      isResetOnly,
      isInstanceAdmin: result.body.user.isInstanceAdmin,
    };
    return true;
  }
}
