import { HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiException } from './apiException.js';

/**
 * Route parameter decorator for :userId validating that it is a valid UUID v4.
 * Throws 400 VALIDATION_ERROR with fields.userId on malformed UUID (API B1, B5.1).
 * Reusable for CPR (feature 15).
 */
export function MemberUserIdParam(): ParameterDecorator {
  return Param(
    'userId',
    new ParseUUIDPipe({
      version: '4',
      exceptionFactory: (error) =>
        new ApiException(
          HttpStatus.BAD_REQUEST,
          'VALIDATION_ERROR',
          'Check the highlighted fields',
          {
            fields: {
              userId:
                typeof error === 'string'
                  ? error
                  : 'Validation failed (uuid v4 is expected)',
            },
          },
        ),
    }),
  );
}
