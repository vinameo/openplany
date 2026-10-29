import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import type { MessageKey, MessageRef } from '@repo/contracts';
import { ApiException, type ApiFieldError } from './apiException.js';

const MESSAGE_REF_PREFIX = 'messageRef:';

/** Encoded constraint message → the MessageRef it stands for. */
const MESSAGE_REFS_BY_TOKEN = new Map<string, MessageRef>();

/**
 * Encodes a MessageRef as a DTO constraint's `message` (API B5.2). The token is
 * unique per key and params, so the pipe decodes the message of the exact
 * constraint that failed, even when a property has two decorators of one type.
 */
export function validationMessage(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const ref: MessageRef = params === undefined ? { key } : { key, params };
  const token = `${MESSAGE_REF_PREFIX}${JSON.stringify(ref)}`;
  MESSAGE_REFS_BY_TOKEN.set(token, ref);
  return token;
}

/** The MessageRef a constraint message encodes, or null for class-validator's own text. */
export function decodeValidationMessage(raw: unknown): MessageRef | null {
  return typeof raw === 'string'
    ? (MESSAGE_REFS_BY_TOKEN.get(raw) ?? null)
    : null;
}

/** The field error for a failed constraint: its MessageRef, or class-validator's sentence. */
export function constraintFieldError(message: string): ApiFieldError {
  return decodeValidationMessage(message) ?? { libraryText: message };
}

function collectFieldErrors(
  errors: ValidationError[],
  prefix = '',
): Record<string, ApiFieldError> {
  const fields: Record<string, ApiFieldError> = {};
  for (const error of errors) {
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    // stopAtFirstError leaves one constraint: the rule that failed.
    const message = Object.values(error.constraints ?? {})[0];
    if (message !== undefined) {
      fields[path] = constraintFieldError(message);
    }
    Object.assign(fields, collectFieldErrors(error.children ?? [], path));
  }
  return fields;
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    // Report the first failing rule per field (e.g. "Enter your password").
    stopAtFirstError: true,
    exceptionFactory: (errors) =>
      new ApiException(
        HttpStatus.BAD_REQUEST,
        'VALIDATION_ERROR',
        { key: 'errors:checkHighlightedFields' },
        { fields: collectFieldErrors(errors) },
      ),
  });
}
