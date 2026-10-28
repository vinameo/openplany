import { HttpException, HttpStatus } from '@nestjs/common';
import {
  DEFAULT_LANGUAGE,
  type Language,
  type MessageRef,
} from '@repo/contracts';
import { translateMessageRef } from '../i18n/i18n.js';

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
  'FORBIDDEN',
  'SLUG_ALREADY_EXISTS',
  'EMAIL_ALREADY_EXISTS',
  'ROLE_PERMISSIONS_CHANGED',
  'MEMBERS_NOT_ADDABLE',
  'PROJECT_NAME_TAKEN',
  'PROJECT_IDENTIFIER_TAKEN',
  'PROJECT_NOT_FOUND',
  'ROLE_UNCHANGED',
  'PROJECT_ROLE_NOT_ALLOWED',
  'ROLE_NOT_ALLOWED',
  'ROLE_CHANGED',
  'ROLE_INHERITED',
  'LAST_ADMIN',
  'USER_NOT_FOUND',
  'USER_CHANGED_SINCE_LOADED',
  'CANNOT_CHANGE_OWN_PASSWORD',
  'REAUTHENTICATION_REQUIRED',
  'REAUTHENTICATION_FAILED',
  'TOO_MANY_REAUTH_ATTEMPTS',
  'CURRENT_PASSWORD_INCORRECT',
  'TOO_MANY_PASSWORD_ATTEMPTS',
  'TOO_MANY_PASSWORD_CHANGES',
  'PASSWORD_CHANGED_ELSEWHERE',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'MALFORMED_BODY',
  'WORK_ITEM_REQUEST_REUSED',
  'STATE_NOT_FOUND',
  'STATE_NAME_TAKEN',
  'STATE_NAME_TAKEN_IN_PROJECTS',
  'WORKSPACE_STATE_LIMIT_REACHED',
  'PROJECT_STATE_LIMIT_REACHED',
  'STATE_REPLACEMENT_REQUIRED',
  'STATE_REPLACEMENT_INVALID',
  'STATE_UNAVAILABLE',
  'STATE_GROUP_CHANGE_UNCONFIRMED',
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
  count?: number;
}

/**
 * A field error: a MessageRef, or class-validator's own sentence for a
 * constraint that declares no message (only the validation pipes build these).
 */
export type ApiFieldError = MessageRef | { libraryText: string };

/** Renders field errors in `lang`; library sentences exist only in the default language. */
export function resolveApiFields(
  fields: Record<string, ApiFieldError> | undefined,
  lang: Language,
): Record<string, string> | undefined {
  if (!fields) return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(fields)) {
    if ('libraryText' in val) {
      result[key] =
        lang === DEFAULT_LANGUAGE
          ? val.libraryText
          : translateMessageRef({ key: 'errors:invalidValue' }, lang);
    } else {
      result[key] = translateMessageRef(val, lang);
    }
  }
  return result;
}

export interface ApiExceptionOptions {
  fields?: Record<string, ApiFieldError>;
  retryAfterSeconds?: number;
  count?: number;
}

/** An HttpException that carries a machine-readable `code` for the client. */
export class ApiException extends HttpException {
  readonly messageRef: MessageRef;
  readonly fieldErrors?: Record<string, ApiFieldError>;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;
  readonly count?: number;

  constructor(
    status: HttpStatus,
    readonly code: ApiErrorCode,
    message: MessageRef,
    options: ApiExceptionOptions = {},
  ) {
    const enMessage = translateMessageRef(message, 'en');
    super(enMessage, status);
    this.messageRef = message;
    this.fieldErrors = options.fields;
    this.fields = resolveApiFields(options.fields, DEFAULT_LANGUAGE);
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.count = options.count;
  }

  getEnglishFields(): Record<string, string> | undefined {
    return this.fields;
  }
}
