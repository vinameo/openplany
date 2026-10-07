import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export const REQUEST_ID_HEADER = 'X-Request-Id';
// Client-supplied ids end up in logs, so only accept a short, safe charset.
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Registered first in configureApp so every response, errors included, carries it. */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(REQUEST_ID_HEADER);
  request.requestId =
    incoming !== undefined && VALID_REQUEST_ID.test(incoming)
      ? incoming
      : randomUUID();
  response.setHeader(REQUEST_ID_HEADER, request.requestId);
  next();
}
