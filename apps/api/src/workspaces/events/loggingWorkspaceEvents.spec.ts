import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { LoggingWorkspaceEvents } from './loggingWorkspaceEvents.js';

describe('LoggingWorkspaceEvents', () => {
  it('formats structured log without leaking workspace name', async () => {
    const events = new LoggingWorkspaceEvents();
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
});

