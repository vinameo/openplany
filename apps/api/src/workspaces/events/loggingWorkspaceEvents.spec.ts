import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { LoggingWorkspaceEvents } from './loggingWorkspaceEvents.js';

function makeEvents(clock = new FakeClock()): LoggingWorkspaceEvents {
  return new LoggingWorkspaceEvents(
    new InMemorySlidingWindowLimiter({ limit: 1, windowMs: 600_000 }),
    clock,
  );
}

describe('LoggingWorkspaceEvents', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats structured log without leaking workspace name', async () => {
    const events = makeEvents();
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    await events.updated({
      workspaceId: 'ws-123',
      actorId: 'usr-456',
      actorRole: 'admin',
      occurredAt: new Date('2026-10-09T02:15:00.000Z'),
      requestId: 'req-789',
      changes: {
        name: { from: 'Old Secret Name', to: 'New Secret Name' },
        timezone: { from: 'UTC', to: 'Asia/Ho_Chi_Minh' },
        organizationSize: { from: 'Just myself', to: '2-10' },
      },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const loggedMessage = logSpy.mock.calls[0]![0] as string;

    // Must match structured line format
    expect(loggedMessage).toContain('workspace.updated');
    expect(loggedMessage).toContain('requestId=req-789');
    expect(loggedMessage).toContain('userId=usr-456');
    expect(loggedMessage).toContain('workspaceId=ws-123');
    expect(loggedMessage).toContain('role=admin');
    expect(loggedMessage).toContain('changedFields=name,organizationSize,timezone');
    expect(loggedMessage).toContain('organizationSizeFrom=Just myself organizationSizeTo=2-10');
    expect(loggedMessage).toContain('timezoneFrom=UTC timezoneTo=Asia/Ho_Chi_Minh');

    // CRITICAL SECURITY RULE: NEVER log workspace name value
    expect(loggedMessage).not.toContain('Old Secret Name');
    expect(loggedMessage).not.toContain('New Secret Name');
  });

  it('AC-15: formats memberCandidatesSearched at debug level without leaking query, email, or names', async () => {
    const events = makeEvents();
    const debugSpy = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});

    await events.memberCandidatesSearched({
      workspaceId: 'ws-123',
      actorId: 'usr-actor',
      requestId: 'req-search',
      resultCount: 4,
    });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const msg = debugSpy.mock.calls[0]![0] as string;
    expect(msg).toBe(
      'workspace.members.candidates requestId=req-search userId=usr-actor workspaceId=ws-123 resultCount=4',
    );
    expect(msg).not.toContain('email');
    expect(msg).not.toContain('@');
  });

  it('AC-15: formats membersAdded at log level without leaking recipient details', async () => {
    const events = makeEvents();
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    await events.membersAdded({
      workspaceId: 'ws-123',
      actorId: 'usr-actor',
      actorRole: 'admin',
      requestId: 'req-add',
      occurredAt: new Date(),
      count: 3,
      reactivatedCount: 1,
      roles: { admin: 1, member: 1, guest: 1 },
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const msg = logSpy.mock.calls[0]![0] as string;
    expect(msg).toBe(
      'workspace.members.added requestId=req-add userId=usr-actor workspaceId=ws-123 role=admin count=3 reactivated=1 roles=admin:1,member:1,guest:1',
    );
    expect(msg).not.toContain('@');
  });

  it('logs workspace.member.role.forbidden once per actor and window', async () => {
    const clock = new FakeClock();
    const events = makeEvents(clock);
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const event = {
      workspaceId: 'ws-123',
      actorId: 'usr-actor',
      targetId: 'usr-target',
      requestId: 'req-1',
    };

    await events.memberRoleForbidden(event);
    await events.memberRoleForbidden(event);
    await events.memberRoleForbidden({ ...event, actorId: 'usr-other' });
    expect(warnSpy).toHaveBeenCalledTimes(2);

    clock.current = new Date(clock.current.getTime() + 600_001);
    await events.memberRoleForbidden(event);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});

