import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { MemberWorkspace } from './repositories/workspaces.repository.js';

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): MemberWorkspace => {
    const request = ctx.switchToHttp().getRequest();
    return request.workspace;
  },
);

