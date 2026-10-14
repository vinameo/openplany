import {
  type ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { ApiException } from './apiException.js';
import { ApiExceptionFilter } from './apiExceptionFilter.js';

function createMockHost(req: Partial<Request>, res: Partial<Response>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => req as Request,
      getResponse: () => res as Response,
      getNext: vi.fn(),
    }),
  } as unknown as ArgumentsHost;
}

describe('ApiExceptionFilter (API B2.1, B4, B5.1, B5.3, INV-05, INV-07, AC-16)', () => {
  it('renders ApiException in English when no Accept-Language or en is provided', () => {
    const filter = new ApiExceptionFilter();
    const req: Partial<Request> = {
      requestId: 'req-123',
      headers: { 'accept-language': 'en-US,en;q=0.9' },
    };
    let jsonResult: unknown;
    let statusCode: number | undefined;
    const headersSet: Record<string, string> = {};
    const res: Partial<Response> = {
      status: vi.fn().mockImplementation((code: number) => {
        statusCode = code;
        return res;
      }),
      setHeader: vi.fn().mockImplementation((name: string, val: string) => {
        headersSet[name] = val;
      }),
      vary: vi.fn(),
      json: vi.fn().mockImplementation((val: unknown) => {
        jsonResult = val;
        return res;
      }),
    };

    const ex = new ApiException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      { key: 'errors:checkHighlightedFields' },
      {
        fields: {
          email: { libraryText: 'email must be an email' },
          role: { key: 'common:roles.workspace.admin' },
        },
      },
    );

    // INV-07: Error.message is always in English
    expect(ex.message).toBe('Check the highlighted fields');

    filter.catch(ex, createMockHost(req, res));

    expect(statusCode).toBe(400);
    expect(headersSet['Content-Language']).toBe('en');
    expect(res.vary).toHaveBeenCalledWith('Accept-Language');
    expect(jsonResult).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Check the highlighted fields',
      requestId: 'req-123',
      fields: {
        email: 'email must be an email',
        role: 'Admin',
      },
    });
  });

  it('renders ApiException in Vietnamese when Accept-Language is vi', () => {
    const filter = new ApiExceptionFilter();
    const req: Partial<Request> = {
      requestId: 'req-456',
      headers: { 'accept-language': 'vi-VN,vi;q=0.9' },
    };
    let jsonResult: unknown;
    const headersSet: Record<string, string> = {};
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn().mockImplementation((name: string, val: string) => {
        headersSet[name] = val;
      }),
      vary: vi.fn(),
      json: vi.fn().mockImplementation((val: unknown) => {
        jsonResult = val;
      }),
    };

    const ex = new ApiException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      { key: 'errors:checkHighlightedFields' },
      {
        fields: {
          email: { libraryText: 'email must be an email' },
          role: { key: 'common:roles.workspace.admin' },
        },
      },
    );

    filter.catch(ex, createMockHost(req, res));

    expect(headersSet['Content-Language']).toBe('vi');
    expect(jsonResult).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Kiểm tra các trường được đánh dấu',
      requestId: 'req-456',
      fields: {
        email: 'Dữ liệu gửi lên không hợp lệ',
        role: 'Admin',
      },
    });
  });

  it('maps HttpException per API B5.3 for English and Vietnamese', () => {
    const filter = new ApiExceptionFilter();
    const resEn: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      vary: vi.fn(),
      json: vi.fn(),
    };
    const reqEn: Partial<Request> = {
      requestId: 'req-en',
      headers: {},
    };

    filter.catch(
      new HttpException('Cannot GET /api/foo', HttpStatus.NOT_FOUND),
      createMockHost(reqEn, resEn),
    );
    expect(resEn.json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Cannot GET /api/foo',
      requestId: 'req-en',
    });

    const resVi: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      vary: vi.fn(),
      json: vi.fn(),
    };
    const reqVi: Partial<Request> = {
      requestId: 'req-vi',
      headers: { 'accept-language': 'vi' },
    };

    filter.catch(
      new HttpException('Cannot GET /api/foo', HttpStatus.NOT_FOUND),
      createMockHost(reqVi, resVi),
    );
    expect(resVi.json).toHaveBeenCalledWith({
      statusCode: 404,
      code: 'NOT_FOUND',
      message: 'Không tìm thấy nội dung bạn cần',
      requestId: 'req-vi',
    });
  });

  it('logs unhandled 5xx errors in English without header values (INV-07, AC-16)', () => {
    const filter = new ApiExceptionFilter();
    const loggerSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});

    const acceptLanguageHeader = 'vi;q=1.0,fr;q=0.5';
    const req: Partial<Request> = {
      requestId: 'req-crash-789',
      headers: { 'accept-language': acceptLanguageHeader },
    };
    const res: Partial<Response> = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      vary: vi.fn(),
      json: vi.fn(),
    };

    const crashError = new Error('Database connection failed');
    filter.catch(crashError, createMockHost(req, res));

    expect(loggerSpy).toHaveBeenCalled();
    const [logMessage, logStack] = loggerSpy.mock.calls[0] as [string, string];

    // Log message and stack must be in English
    expect(logMessage).toContain('Unhandled error requestId=req-crash-789');
    expect(logStack).toContain('Database connection failed');

    // Header value must NOT be logged
    expect(logMessage).not.toContain(acceptLanguageHeader);
    expect(logStack).not.toContain(acceptLanguageHeader);

    loggerSpy.mockRestore();
  });
});
