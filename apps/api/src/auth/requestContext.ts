import type { Request } from 'express';

/** Longest user agent stored on a session or a login attempt. */
export const MAX_USER_AGENT_LENGTH = 512;

/** Who sent a request, as sign-in and session creation record it. */
export interface RequestContext {
  requestId: string;
  ip: string;
  userAgent: string | null;
}

export function clientIp(request: Request): string {
  // request.ip honours the 'trust proxy' setting (TRUST_PROXY).
  return request.ip ?? request.socket.remoteAddress ?? 'unknown';
}

export function requestContext(request: Request): RequestContext {
  return {
    requestId: request.requestId,
    ip: clientIp(request),
    userAgent: request.header('User-Agent') ?? null,
  };
}

export function truncateUserAgent(userAgent: string | null): string | null {
  return userAgent === null ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH);
}
