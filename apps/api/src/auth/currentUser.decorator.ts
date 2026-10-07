import {
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';

export const ALLOW_RESET_ONLY_KEY = 'allowResetOnlySession';

/** Lets a reset-only session (password change pending) reach this handler. */
export const AllowResetOnlySession = (): ClassDecorator & MethodDecorator =>
  SetMetadata(ALLOW_RESET_ONLY_KEY, true);

/** The id of the user behind the session; set by SessionGuard, never by the client. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const userId = context.switchToHttp().getRequest<Request>().auth?.userId;
    if (userId === undefined) {
      throw new Error('CurrentUserId used on a route without SessionGuard');
    }
    return userId;
  },
);
