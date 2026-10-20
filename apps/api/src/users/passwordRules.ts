import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../common/apiException.js';

/** Case-insensitive, as the API compares emails everywhere (S1, DB B6 step 4). */
export function isSameAsEmail(password: string, email: string | null): boolean {
  return password.toLowerCase() === (email ?? '').toLowerCase();
}

export function passwordSameAsEmail(field = 'password'): ApiException {
  return new ApiException(
    HttpStatus.BAD_REQUEST,
    'VALIDATION_ERROR',
    { key: 'errors:checkHighlightedFields' },
    { fields: { [field]: { key: 'users:errors.passwordSameAsEmail' } } },
  );
}
