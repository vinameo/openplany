import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';
import {
  createUser,
  DEFAULT_E2E_ORIGIN as ORIGIN,
  signInCookie,
} from './helpers/e2eUsers.js';

describe('bodyParserErrors (API B2.2, RQ D28, D29, INV-16, AC-33, AC-36)', () => {
  let e2e: E2eApp;
  let cookie: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
    await e2e.reset();
    await createUser(e2e, 'body-errors-user@openplany.dev');
    cookie = await signInCookie(e2e, 'body-errors-user@openplany.dev');
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const http = () => request(e2e.app.getHttpServer());

  it('rejects payload > 512 KB with 413 PAYLOAD_TOO_LARGE and translated message in en and vi (AC-33, AC-36)', async () => {
    // 600 KB payload exceeds the 512 KB limit
    const largePayload = JSON.stringify({ displayName: 'a'.repeat(600_000) });

    const resEn = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Accept-Language', 'en')
      .send(largePayload);

    expect(resEn.status).toBe(413);
    expect(resEn.body).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'The request is too large.',
      requestId: expect.any(String),
    });

    const resVi = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Accept-Language', 'vi')
      .send(largePayload);

    expect(resVi.status).toBe(413);
    expect(resVi.body).toEqual({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Yêu cầu quá lớn.',
      requestId: expect.any(String),
    });
  });

  it('rejects unsupported charset with 415 UNSUPPORTED_MEDIA_TYPE (AC-36)', async () => {
    const payload = JSON.stringify({ displayName: 'test' });

    const resEn = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json; charset=latin1')
      .set('Accept-Language', 'en')
      .send(payload);

    expect(resEn.status).toBe(415);
    expect(resEn.body).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: "This request format isn't supported.",
      requestId: expect.any(String),
    });

    const resVi = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json; charset=latin1')
      .set('Accept-Language', 'vi')
      .send(payload);

    expect(resVi.status).toBe(415);
    expect(resVi.body).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Định dạng yêu cầu này không được hỗ trợ.',
      requestId: expect.any(String),
    });
  });

  it('rejects broken gzip encoding with 400 MALFORMED_BODY (AC-36)', async () => {
    const resEn = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .set('Accept-Language', 'en')
      .send('broken-gzip-not-compressed');

    expect(resEn.status).toBe(400);
    expect(resEn.body).toEqual({
      statusCode: 400,
      code: 'MALFORMED_BODY',
      message: "The request couldn't be read.",
      requestId: expect.any(String),
    });

    const resVi = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .set('Accept-Language', 'vi')
      .send('broken-gzip-not-compressed');

    expect(resVi.status).toBe(400);
    expect(resVi.body).toEqual({
      statusCode: 400,
      code: 'MALFORMED_BODY',
      message: 'Không đọc được yêu cầu.',
      requestId: expect.any(String),
    });
  });

  it('rejects unsupported Content-Encoding with 415 UNSUPPORTED_MEDIA_TYPE (AC-36)', async () => {
    const resEn = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br2')
      .set('Accept-Language', 'en')
      .send('any-data');

    expect(resEn.status).toBe(415);
    expect(resEn.body).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: "This request format isn't supported.",
      requestId: expect.any(String),
    });

    const resVi = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'br2')
      .set('Accept-Language', 'vi')
      .send('any-data');

    expect(resVi.status).toBe(415);
    expect(resVi.body).toEqual({
      statusCode: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'Định dạng yêu cầu này không được hỗ trợ.',
      requestId: expect.any(String),
    });
  });

  it('allows body near limit (400 KB) without triggering 413 (AC-36)', async () => {
    // 400 KB payload is parsed by body-parser (<= 512 KB), not rejected with 413
    const nearLimitPayload = JSON.stringify({
      displayName: 'a'.repeat(400_000),
    });

    const res = await http()
      .patch('/api/users/me')
      .set('Cookie', cookie)
      .set('Origin', ORIGIN)
      .set('Content-Type', 'application/json')
      .send(nearLimitPayload);

    // It passes body-parser and reaches ValidationPipe (fails on displayName length), not 413
    expect(res.status).not.toBe(413);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
