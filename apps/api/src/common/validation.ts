import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import type { MessageKey, MessageRef } from '@repo/contracts';
import { ApiException, type ApiFieldError } from './apiException.js';

/** Encodes a MessageRef into a constraint message string for DTOs. */
export function validationMessage(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  return JSON.stringify({ key, params });
}

/** Decodes a constraint message string into a MessageRef if it was encoded. */
export function decodeValidationMessage(raw: string): MessageRef | null {
  if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.key === 'string') {
        return parsed as MessageRef;
      }
    } catch {
      // not JSON
    }
  }
  return null;
}

function collectFieldErrors(
  errors: ValidationError[],
  prefix = '',
): Record<string, ApiFieldError> {
  const fields: Record<string, ApiFieldError> = {};
  for (const error of errors) {
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const firstConstraint = Object.values(error.constraints ?? {})[0];
    if (firstConstraint !== undefined) {
      const decoded = decodeValidationMessage(firstConstraint);
      fields[path] = decoded ?? { libraryText: firstConstraint };
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
