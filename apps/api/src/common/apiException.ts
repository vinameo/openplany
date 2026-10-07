import { HttpException, HttpStatus } from '@nestjs/common';

export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'INVALID_CREDENTIALS',
  'ACCOUNT_DEACTIVATED',
  'SSO_REQUIRED',
  'ORIGIN_NOT_ALLOWED',
  'TOO_MANY_ATTEMPTS',
  'UNAUTHENTICATED',
  'PASSWORD_RESET_REQUIRED',
  'NOT_FOUND',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Body of every error response (api-spec 2.1). */
export interface ApiErrorBody {
  statusCode: number;
  code: ApiErrorCode;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}

interface ApiExceptionOptions {
  fields?: Record<string, string>;
  retryAfterSeconds?: number;
}

/** An HttpException that carries a machine-readable `code` for the client. */
export class ApiException extends HttpException {
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: string,
    options: ApiExceptionOptions = {},
  ) {
    super(message, status);
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}
