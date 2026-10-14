import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  DEFAULT_LANGUAGE,
  type Language,
  type MessageKey,
} from '@repo/contracts';
import {
  ApiException,
  type ApiErrorBody,
  type ApiErrorCode,
  resolveApiFields,
} from './apiException.js';
import { translateMessageRef } from '../i18n/i18n.js';
import { getRequestLanguage } from '../i18n/language.middleware.js';

const DEFAULT_CODES: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
};

/** Sentence for a Nest HttpException outside the default language (API B5.3). */
const HTTP_ERROR_KEYS: Partial<Record<ApiErrorCode, MessageKey>> = {
  VALIDATION_ERROR: 'errors:http.validationError',
  UNAUTHENTICATED: 'errors:http.unauthenticated',
  NOT_FOUND: 'errors:http.notFound',
};
const INTERNAL_ERROR_KEY: MessageKey = 'errors:http.internalError';

/**
 * Renders every error in the api-spec 2.1 shape.
 * Translates message and fields according to the request language.
 * Unknown errors become a generic 500 so stack traces and SQL never reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId;
    const lang = getRequestLanguage(request);

    response.setHeader('Content-Language', lang);
    response.vary('Accept-Language');

    const body = this.toBody(exception, requestId, lang);
    if (body.statusCode >= 500) {
      this.logger.error(
        `Unhandled error requestId=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }
    if (body.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(body.retryAfterSeconds));
    }
    response.status(body.statusCode).json(body);
  }

  private toBody(
    exception: unknown,
    requestId: string,
    lang: Language,
  ): ApiErrorBody {
    if (exception instanceof ApiException) {
      const message = translateMessageRef(exception.messageRef, lang);
      const fields = resolveApiFields(exception.fieldErrors, lang);

      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message,
        requestId,
        ...(fields && { fields }),
        ...(exception.retryAfterSeconds !== undefined && {
          retryAfterSeconds: exception.retryAfterSeconds,
        }),
      };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const code = DEFAULT_CODES[statusCode] ?? 'INTERNAL_ERROR';
      let message: string;
      if (statusCode >= 500) {
        message = translateMessageRef({ key: INTERNAL_ERROR_KEY }, lang);
      } else if (lang === DEFAULT_LANGUAGE) {
        message = exception.message;
      } else {
        message = translateMessageRef(
          { key: HTTP_ERROR_KEYS[code] ?? INTERNAL_ERROR_KEY },
          lang,
        );
      }
      return {
        statusCode,
        code,
        message,
        requestId,
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: translateMessageRef({ key: INTERNAL_ERROR_KEY }, lang),
      requestId,
    };
  }
}
