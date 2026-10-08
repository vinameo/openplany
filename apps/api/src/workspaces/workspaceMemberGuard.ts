import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { workspaceSlugProblem } from '@repo/contracts';
import type { Request } from 'express';
import { ApiException } from '../common/apiException.js';
import {
  type MemberWorkspace,
  WorkspacesRepository,
} from './repositories/workspaces.repository.js';

declare module 'express-serve-static-core' {
  interface Request {
    workspace?: MemberWorkspace;
  }
}

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly workspacesRepository: WorkspacesRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const slug = request.params?.slug;
    const userId = request.auth?.userId;

    if (
      !slug ||
      typeof slug !== 'string' ||
      workspaceSlugProblem(slug) === 'INVALID'
    ) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Workspace not found',
      );
    }

    if (!userId) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        'UNAUTHENTICATED',
        'Sign in to continue',
      );
    }

    const workspace = await this.workspacesRepository.findForMember(
      slug,
      userId,
    );
    if (!workspace) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        'NOT_FOUND',
        'Workspace not found',
      );
    }

    request.workspace = workspace;
    return true;
  }
}

