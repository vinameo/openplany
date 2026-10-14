import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_LANGUAGE,
  type Language,
  languageFromAcceptLanguage,
} from '@repo/contracts';

declare global {
  namespace Express {
    interface Request {
      language?: Language;
    }
  }
}

/**
 * Middleware that inspects the Accept-Language header once per request,
 * attaches the resolved Language to req.language, and sets Content-Language
 * and Vary headers on the response.
 */
export function languageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const lang = languageFromAcceptLanguage(req.headers['accept-language']);
  req.language = lang;
  res.setHeader('Content-Language', lang);
  res.vary('Accept-Language');
  next();
}

/**
 * Retrieves the resolved Language of a request.
 * If the middleware has not executed yet, safely determines language directly from headers.
 */
export function getRequestLanguage(req?: Request): Language {
  if (req?.language) {
    return req.language;
  }
  const rawHeader = req?.headers?.['accept-language'];
  if (rawHeader !== undefined) {
    return languageFromAcceptLanguage(rawHeader);
  }
  return DEFAULT_LANGUAGE;
}
