import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSessionToken, hashSessionToken } from './authTokens.js';
import type { NewSession } from './repositories/sessionsRepository.js';
import { truncateUserAgent } from './requestContext.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RESET_ONLY_SESSION_MS = 15 * 60 * 1000;

export interface IssuedSession {
  token: string;
  record: NewSession;
  maxAgeMs: number;
}

@Injectable()
export class SessionIssuer {
  private readonly sessionTtlMs: number;

  constructor(config: ConfigService) {
    this.sessionTtlMs = config.getOrThrow<number>('SESSION_TTL_DAYS') * DAY_MS;
  }

  issue(input: {
    userId: string;
    now: Date;
    resetOnly: boolean;
    ip: string;
    userAgent: string | null;
  }): IssuedSession {
    const maxAgeMs = input.resetOnly
      ? RESET_ONLY_SESSION_MS
      : this.sessionTtlMs;
    const expiresAt = new Date(input.now.getTime() + maxAgeMs);
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const userAgent = truncateUserAgent(input.userAgent);

    return {
      token,
      maxAgeMs,
      record: {
        userId: input.userId,
        tokenHash,
        loginMedium: 'email',
        ip: input.ip,
        userAgent,
        createdAt: input.now,
        lastUsedAt: input.now,
        expiresAt,
        isResetOnly: input.resetOnly,
      },
    };
  }
}
