import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Language } from '@repo/contracts';
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

const HTTP_ERROR_VI_MESSAGES: Record<string, string> = {
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ',
  UNAUTHENTICATED: 'Đăng nhập để tiếp tục',
  NOT_FOUND: 'Không tìm thấy nội dung bạn cần',
  INTERNAL_ERROR: 'Đã có lỗi xảy ra',
};

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
      const message = exception.messageRef
        ? translateMessageRef(exception.messageRef, lang)
        : exception.message;

      const fields = resolveApiFields(exception.fields, lang);

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
      if (lang === 'vi') {
        message = HTTP_ERROR_VI_MESSAGES[code] ?? 'Đã có lỗi xảy ra';
      } else {
        message =
          statusCode >= 500 ? 'Something went wrong' : exception.message;
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
      message: lang === 'vi' ? 'Đã có lỗi xảy ra' : 'Something went wrong',
      requestId,
    };
  }
}
