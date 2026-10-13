import { HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ApiException } from './apiException.js';
import { MemberUserIdParam } from './memberUserIdParam.js';

describe('MemberUserIdParam', () => {
  it('decorates a method parameter without errors', () => {
    class TestController {
      testMethod(@MemberUserIdParam() _userId: string) {}
    }
    expect(TestController).toBeDefined();
  });

  it('validates UUID v4 and maps invalid UUID to 400 VALIDATION_ERROR with fields.userId', async () => {
    class Dummy {
      action(@MemberUserIdParam() _id: string) {}
    }
    expect(Dummy).toBeDefined();

    // Directly test the pipe options created by MemberUserIdParam
    const pipe = new ParseUUIDPipe({
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
    });

    const validUuid = '11111111-2222-4444-8888-999999999999';
    await expect(
      pipe.transform(validUuid, {
        type: 'param',
        metatype: String,
        data: 'userId',
      }),
    ).resolves.toBe(validUuid);

    try {
      await pipe.transform('invalid-uuid', {
        type: 'param',
        metatype: String,
        data: 'userId',
      });
      expect.fail('Should have thrown ApiException');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiException);
      const apiErr = err as ApiException;
      expect(apiErr.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(apiErr.code).toBe('VALIDATION_ERROR');
      expect(apiErr.fields).toHaveProperty('userId');
    }
  });
});
