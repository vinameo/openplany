import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeClock } from '../../../test/fakes/authFakes.js';
import { InMemorySlidingWindowLimiter } from '../../common/slidingWindowLimiter.js';
import { LoggingProjectEvents } from './loggingProjectEvents.js';

describe('LoggingProjectEvents', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs project.member.role.forbidden once per actor and window', async () => {
    const clock = new FakeClock();
    const events = new LoggingProjectEvents(
      new InMemorySlidingWindowLimiter({ limit: 1, windowMs: 600_000 }),
      clock,
    );
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const event = {
      projectId: 'p-1',
      actorId: 'usr-actor',
      targetId: 'usr-target',
      requestId: 'req-1',
    };

    await events.roleForbidden(event);
    await events.roleForbidden(event);
    await events.roleForbidden({ ...event, actorId: 'usr-other' });
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy.mock.calls[0]![0]).toBe(
      'project.member.role.forbidden projectId=p-1 actorId=usr-actor targetId=usr-target requestId=req-1',
    );

    clock.current = new Date(clock.current.getTime() + 600_001);
    await events.roleForbidden(event);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});
