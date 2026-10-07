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
  ApiException,
  type ApiErrorBody,
  type ApiErrorCode,
} from './apiException.js';

const DEFAULT_CODES: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
};

/**
 * Renders every error in the api-spec 2.1 shape. Unknown errors become a
 * generic 500 so stack traces and SQL never reach the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId = request.requestId;

    const body = this.toBody(exception, requestId);
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

  private toBody(exception: unknown, requestId: string): ApiErrorBody {
    if (exception instanceof ApiException) {
      return {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: exception.message,
        requestId,
        ...(exception.fields && { fields: exception.fields }),
        ...(exception.retryAfterSeconds !== undefined && {
          retryAfterSeconds: exception.retryAfterSeconds,
        }),
      };
    }
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        code: DEFAULT_CODES[statusCode] ?? 'INTERNAL_ERROR',
        message: statusCode >= 500 ? 'Something went wrong' : exception.message,
        requestId,
      };
    }
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    };
  }
}
