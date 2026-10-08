import { type ExecutionContext, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeWorkspacesRepository,
  makeMemberWorkspace,
} from '../../test/fakes/workspacesFakes.js';
import { WorkspaceMemberGuard } from './workspaceMemberGuard.js';

describe('WorkspaceMemberGuard', () => {
  let repository: FakeWorkspacesRepository;
  let guard: WorkspaceMemberGuard;

  beforeEach(() => {
    repository = new FakeWorkspacesRepository();
    guard = new WorkspaceMemberGuard(repository);
  });

  function makeContext(params: Record<string, string>, auth?: { userId: string }): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = {
      params,
      auth,
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  }

  it('throws 404 without querying DB if slug is invalid format', async () => {
    let repoCalled = false;
    repository.findForMember = () => {
      repoCalled = true;
      return Promise.resolve(null);
    };

    const { context } = makeContext({ slug: 'ab' }, { userId: 'user-1' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: 'NOT_FOUND',
    });
    expect(repoCalled).toBe(false);
  });

  it('throws 401 if user is unauthenticated', async () => {
    const { context } = makeContext({ slug: 'valid-slug' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.UNAUTHORIZED,
      code: 'UNAUTHENTICATED',
    });
  });

  it('throws 404 if workspace does not exist or user is not a member', async () => {
    const { context } = makeContext({ slug: 'acme-corp' }, { userId: 'user-1' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      code: 'NOT_FOUND',
    });
  });

  it('attaches workspace to request and returns true when member is found', async () => {
    const ws = makeMemberWorkspace({ slug: 'acme-corp' });
    repository.memberWorkspaces = [ws];

    const { context, request } = makeContext(
      { slug: 'acme-corp' },
      { userId: 'user-1' },
    );

    const allowed = await guard.canActivate(context);
    expect(allowed).toBe(true);
    expect(request.workspace).toEqual(ws);
  });
});

