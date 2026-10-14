import { DEFAULT_LANGUAGE } from '@repo/contracts';
import { resolveApiFields } from './apiException.js';
import { constraintFieldError } from './validation.js';

/** A failed constraint's message as an English error response renders it (DTO unit tests). */
export function englishConstraintMessage(message: string | undefined): string | undefined {
  if (message === undefined) return undefined;
  return resolveApiFields({ field: constraintFieldError(message) }, DEFAULT_LANGUAGE)?.field;
}
