import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LoggingUserEvents } from './loggingUserEvents.js';

describe('LoggingUserEvents', () => {
  it('logs user.created event in exact format', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const events = new LoggingUserEvents();

    try {
      await events.created({
        userId: 'user-uuid-1',
        actorId: 'actor-uuid-2',
        occurredAt: new Date('2026-10-09T10:00:00.000Z'),
        requestId: 'req-123',
      });

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith(
        'user.created userId=user-uuid-1 actorId=actor-uuid-2 requestId=req-123',
      );
    } finally {
      logSpy.mockRestore();
    }
  });
});

