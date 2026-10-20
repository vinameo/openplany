import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  MAX_USER_AGENT_LENGTH,
  RESET_ONLY_SESSION_MS,
  SessionIssuer,
} from './sessionIssuer.js';

describe('SessionIssuer', () => {
  const fakeConfig = {
    getOrThrow: (key: string) => {
      if (key === 'SESSION_TTL_DAYS') return 7;
      throw new Error(`Unknown key: ${key}`);
    },
  } as unknown as ConfigService;

  it('issues normal session with correct TTL and maxAgeMs', () => {
    const issuer = new SessionIssuer(fakeConfig);
    const now = new Date('2026-10-20T12:00:00.000Z');
    const issued = issuer.issue({
      userId: 'u1',
      now,
      resetOnly: false,
      ip: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(issued.token).toBeTruthy();
    expect(issued.maxAgeMs).toBe(7 * DAY_MS);
    expect(issued.record.expiresAt.getTime()).toBe(now.getTime() + 7 * DAY_MS);
    expect(issued.record.isResetOnly).toBe(false);
    expect(issued.record.userId).toBe('u1');
    expect(issued.record.ip).toBe('127.0.0.1');
    expect(issued.record.userAgent).toBe('Mozilla/5.0');
    expect(issued.record.loginMedium).toBe('email');
  });

  it('issues reset-only session with RESET_ONLY_SESSION_MS TTL', () => {
    const issuer = new SessionIssuer(fakeConfig);
    const now = new Date('2026-10-20T12:00:00.000Z');
    const issued = issuer.issue({
      userId: 'u2',
      now,
      resetOnly: true,
      ip: '10.0.0.1',
      userAgent: null,
    });

    expect(issued.maxAgeMs).toBe(RESET_ONLY_SESSION_MS);
    expect(issued.record.expiresAt.getTime()).toBe(
      now.getTime() + RESET_ONLY_SESSION_MS,
    );
    expect(issued.record.isResetOnly).toBe(true);
    expect(issued.record.userAgent).toBeNull();
  });

  it('truncates long user agents to MAX_USER_AGENT_LENGTH', () => {
    const issuer = new SessionIssuer(fakeConfig);
    const now = new Date('2026-10-20T12:00:00.000Z');
    const longUa = 'a'.repeat(600);
    const issued = issuer.issue({
      userId: 'u3',
      now,
      resetOnly: false,
      ip: '127.0.0.1',
      userAgent: longUa,
    });

    expect(issued.record.userAgent?.length).toBe(MAX_USER_AGENT_LENGTH);
    expect(issued.record.userAgent).toBe('a'.repeat(MAX_USER_AGENT_LENGTH));
  });

  it('generates distinct tokens on every issue call', () => {
    const issuer = new SessionIssuer(fakeConfig);
    const now = new Date('2026-10-20T12:00:00.000Z');
    const s1 = issuer.issue({
      userId: 'u1',
      now,
      resetOnly: false,
      ip: '127.0.0.1',
      userAgent: null,
    });
    const s2 = issuer.issue({
      userId: 'u1',
      now,
      resetOnly: false,
      ip: '127.0.0.1',
      userAgent: null,
    });

    expect(s1.token).not.toBe(s2.token);
    expect(s1.record.tokenHash).not.toBe(s2.record.tokenHash);
  });
});
