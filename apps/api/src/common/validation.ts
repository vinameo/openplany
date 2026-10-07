import {
  HttpStatus,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { ApiException } from './apiException.js';

function collectFieldErrors(
  errors: ValidationError[],
  prefix = '',
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const error of errors) {
    const path = prefix === '' ? error.property : `${prefix}.${error.property}`;
    const first = Object.values(error.constraints ?? {})[0];
    if (first !== undefined) fields[path] = first;
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
        'Check the highlighted fields',
        { fields: collectFieldErrors(errors) },
      ),
  });
}
