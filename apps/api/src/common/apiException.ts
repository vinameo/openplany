import { HttpException, HttpStatus } from '@nestjs/common';
import {
  MEMBER_MESSAGES,
  MEMBER_MESSAGE_REFS,
  type Language,
  type MessageRef,
} from '@repo/contracts';
import { translateMessageRef } from '../i18n/i18n.js';

const KNOWN_STRING_MESSAGE_REFS: Record<string, MessageRef> = {
  [MEMBER_MESSAGES.rowDuplicate]: MEMBER_MESSAGE_REFS.rowDuplicate,
  [MEMBER_MESSAGES.chooseRole]: MEMBER_MESSAGE_REFS.chooseRole,
  [MEMBER_MESSAGES.choosePerson]: MEMBER_MESSAGE_REFS.choosePerson,
  [MEMBER_MESSAGES.addAtLeastOne]: MEMBER_MESSAGE_REFS.addAtLeastOne,
  [MEMBER_MESSAGES.checkFields]: MEMBER_MESSAGE_REFS.checkFields,
  [MEMBER_MESSAGES.notAllowed]: MEMBER_MESSAGE_REFS.notAllowed,
  [MEMBER_MESSAGES.roleNotAllowed]: MEMBER_MESSAGE_REFS.roleNotAllowed,
  [MEMBER_MESSAGES.sameRole]: MEMBER_MESSAGE_REFS.sameRole,
  [MEMBER_MESSAGES.roleOutOfRange]: MEMBER_MESSAGE_REFS.roleOutOfRange,
  [MEMBER_MESSAGES.someNotAdded]: MEMBER_MESSAGE_REFS.someNotAdded,
};

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

export type ApiFieldError = MessageRef | { libraryText: string } | string;

export function resolveApiFields(
  fields?: Record<string, ApiFieldError>,
  lang: Language = 'en',
): Record<string, string> | undefined {
  if (!fields) return undefined;
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(fields)) {
    if (typeof val === 'string') {
      const knownRef = KNOWN_STRING_MESSAGE_REFS[val];
      result[key] = knownRef ? translateMessageRef(knownRef, lang) : val;
    } else if ('libraryText' in val) {
      result[key] =
        lang === 'vi'
          ? translateMessageRef({ key: 'errors:invalidValue' }, 'vi')
          : val.libraryText;
    } else {
      result[key] = translateMessageRef(val, lang);
    }
  }
  return result;
}

export interface ApiExceptionOptions {
  fields?: Record<string, ApiFieldError>;
  retryAfterSeconds?: number;
}

/** An HttpException that carries a machine-readable `code` for the client. */
export class ApiException extends HttpException {
  readonly messageRef: MessageRef;
  readonly fieldErrors?: Record<string, ApiFieldError>;
  readonly fields?: Record<string, string>;
  readonly retryAfterSeconds?: number;

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
    this.fields = resolveApiFields(options.fields, 'en');
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  getEnglishFields(): Record<string, string> | undefined {
    return this.fields;
  }
}
