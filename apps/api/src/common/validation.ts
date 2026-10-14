import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';
import type { MessageKey, MessageRef } from '@repo/contracts';
import { translateMessageRef } from '../i18n/i18n.js';
import { ApiException, type ApiFieldError } from './apiException.js';

export interface ValidationMessageFunction {
  (): string;
  messageRef: MessageRef;
  key: MessageKey;
  params?: Record<string, string | number>;
}

const REGISTRY_BY_TEXT = new Map<string, MessageRef>();

/** Encodes a MessageRef into a constraint message function for DTOs. */
export function validationMessage(
  key: MessageKey,
  params?: Record<string, string | number>,
): ValidationMessageFunction {
  const ref: MessageRef = { key, params };
  const english = translateMessageRef(ref, 'en');
  REGISTRY_BY_TEXT.set(english, ref);

  const fn = (() => english) as ValidationMessageFunction;
  fn.messageRef = ref;
  fn.key = key;
  fn.params = params;
  fn.toString = () => JSON.stringify(ref);
  return fn;
}

/** Decodes a constraint message string or function into a MessageRef if it was encoded. */
export function decodeValidationMessage(raw: unknown): MessageRef | null {
  if (
    typeof raw === 'function' &&
    'messageRef' in raw &&
    typeof (raw as Record<string, unknown>).messageRef === 'object' &&
    (raw as Record<string, unknown>).messageRef !== null
  ) {
    return (raw as { messageRef: MessageRef }).messageRef;
  }
  if (typeof raw === 'string') {
    if (raw.startsWith('{') && raw.endsWith('}')) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'key' in parsed &&
          typeof (parsed as Record<string, unknown>).key === 'string'
        ) {
          return parsed as MessageRef;
        }
      } catch {
        // not JSON
      }
    }
    return REGISTRY_BY_TEXT.get(raw) ?? null;
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
    const constraintType = Object.keys(error.constraints ?? {})[0];
    const firstConstraint = Object.values(error.constraints ?? {})[0];
    if (firstConstraint !== undefined) {
      let ref: MessageRef | null = null;
      if (error.target?.constructor && constraintType) {
        try {
          const metadatas = getMetadataStorage().getTargetValidationMetadatas(
            error.target.constructor,
            '',
            true,
            false,
          );
          const found = metadatas.find(
            (m) =>
              m.propertyName === error.property &&
              (m.name === constraintType || m.type === constraintType),
          );
          if (found) {
            ref = decodeValidationMessage(found.message);
          }
        } catch {
          // ignore
        }
      }
      if (!ref) {
        ref = decodeValidationMessage(firstConstraint);
      }
      fields[path] = ref ?? { libraryText: firstConstraint };
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
