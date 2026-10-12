import type { ExecutionContext } from '@nestjs/common';
import {
  DEFAULT_PROJECT_COVER,
  DEFAULT_PROJECT_ICON,
  DEFAULT_PROJECT_ICON_COLOR,
} from '@repo/contracts';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import {
  FakeProjectAccessResolver,
  FakeProjectEvents,
} from '../../../test/fakes/projectsFakes.js';
import { makeMemberWorkspace } from '../../../test/fakes/workspacesFakes.js';
import { InMemorySlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { ProjectAccessGuard } from './projectAccessGuard.js';
import type { AccessibleProject } from './projectAccessResolver.js';

const ACCESSIBLE: AccessibleProject = {
  project: {
    id: 'p-1',
    name: 'Project One',
    identifier: 'PROJ1',
    description: '',
    iconName: DEFAULT_PROJECT_ICON,
    iconColor: DEFAULT_PROJECT_ICON_COLOR,
    coverKey: DEFAULT_PROJECT_COVER,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  },
  access: { role: 'contributor', permissions: ['project.members.view'] },
};

describe('ProjectAccessGuard', () => {
  function makeSetup(limit = 30) {
    const resolver = new FakeProjectAccessResolver();
    const events = new FakeProjectEvents();
    const guard = new ProjectAccessGuard(
      resolver,
      events,
      new InMemorySlidingWindowLimiter({ limit, windowMs: 600_000 }),
      new InMemorySlidingWindowLimiter({ limit: 1, windowMs: 600_000 }),
      new FakeClock(),
    );
    return { guard, resolver, events };
  }

  function makeContext(
    identifier: string | undefined,
    overrides: Partial<Request> = {},
  ): { ctx: ExecutionContext; request: Partial<Request> } {
    const request: Partial<Request> = {
      workspace: makeMemberWorkspace({ role: 'member' }),
      auth: { userId: 'u-1' } as Request['auth'],
      params: identifier === undefined ? {} : { identifier },
      requestId: 'req-1',
      ...overrides,
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('throws a programming error when run before WorkspaceMemberGuard', async () => {
    const { guard } = makeSetup();
    const { ctx } = makeContext('PROJ1', { workspace: undefined });
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'ProjectAccessGuard must run after WorkspaceMemberGuard',
    );
  });

  it('throws a programming error on a route without :identifier', async () => {
    const { guard } = makeSetup();
    const { ctx } = makeContext(undefined);
    await expect(guard.canActivate(ctx)).rejects.toThrow(
      'ProjectAccessGuard used on a route without :identifier',
    );
  });

  it('throws 404 PROJECT_NOT_FOUND for a malformed identifier without querying (AC-12)', async () => {
    const { guard, resolver, events } = makeSetup();
    for (const invalid of ['tfp11', 'abc-12345', '1AB', '']) {
      const { ctx } = makeContext(invalid);
      await expect(guard.canActivate(ctx)).rejects.toMatchObject({
        status: 404,
        code: 'PROJECT_NOT_FOUND',
      });
    }
    expect(resolver.lastLookupInput).toBeUndefined();
    expect(events.accessDeniedEvents).toHaveLength(0);
  });

  it('throws 404 PROJECT_NOT_FOUND when the project does not exist (AC-13)', async () => {
    const { guard, resolver, events } = makeSetup();
    resolver.lookup = { kind: 'not_found' };
    const { ctx } = makeContext('PROJ1');

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
    });
    expect(resolver.lastLookupInput).toEqual({
      workspaceId: 'ws-1',
      userId: 'u-1',
      workspaceRole: 'member',
      identifier: 'PROJ1',
    });
    expect(events.accessDeniedEvents).toHaveLength(0);
  });

  it('throws 403 FORBIDDEN and logs accessDenied when the viewer cannot access (AC-14, M-05)', async () => {
    const { guard, resolver, events } = makeSetup();
    resolver.lookup = { kind: 'forbidden', projectId: 'p-1' };
    const { ctx } = makeContext('PROJ1');

    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(events.accessDeniedEvents).toEqual([
      {
        projectId: 'p-1',
        workspaceId: 'ws-1',
        userId: 'u-1',
        requestId: 'req-1',
      },
    ]);
  });

  it('attaches the accessible project to the request', async () => {
    const { guard, resolver } = makeSetup();
    resolver.lookup = { kind: 'accessible', project: ACCESSIBLE };
    const { ctx, request } = makeContext('PROJ1');

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(request.project).toBe(ACCESSIBLE);
  });

  it('answers 429 for every miss past the limit, hiding 403 vs 404, and warns once (BR1)', async () => {
    const { guard, resolver, events } = makeSetup(2);
    resolver.lookup = { kind: 'forbidden', projectId: 'p-1' };

    for (let i = 0; i < 2; i += 1) {
      await expect(
        guard.canActivate(makeContext('PROJ1').ctx),
      ).rejects.toMatchObject({
        status: 403,
      });
    }
    await expect(
      guard.canActivate(makeContext('PROJ1').ctx),
    ).rejects.toMatchObject({
      status: 429,
      code: 'TOO_MANY_ATTEMPTS',
    });
    resolver.lookup = { kind: 'not_found' };
    await expect(
      guard.canActivate(makeContext('NOPE').ctx),
    ).rejects.toMatchObject({
      status: 429,
    });

    expect(events.accessDeniedEvents).toHaveLength(2);
    expect(events.rateLimitedEvents).toEqual([
      { workspaceId: 'ws-1', userId: 'u-1', requestId: 'req-1' },
    ]);
  });

  it('never throttles projects the viewer can access', async () => {
    const { guard, resolver } = makeSetup(1);
    resolver.lookup = { kind: 'not_found' };
    await expect(
      guard.canActivate(makeContext('NOPE').ctx),
    ).rejects.toMatchObject({
      status: 404,
    });

    resolver.lookup = { kind: 'accessible', project: ACCESSIBLE };
    for (let i = 0; i < 3; i += 1) {
      await expect(guard.canActivate(makeContext('PROJ1').ctx)).resolves.toBe(
        true,
      );
    }
  });
});
