import request from 'supertest';
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

describe('i18n Accept-Language & error responses (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  const B6_CASES = [
    { header: undefined, expectedLang: 'en', label: 'missing' },
    { header: 'vi', expectedLang: 'vi', label: 'vi' },
    { header: 'VI', expectedLang: 'vi', label: 'VI' },
    { header: ' vi ', expectedLang: 'vi', label: ' vi ' },
    { header: 'vi-VN', expectedLang: 'vi', label: 'vi-VN' },
    { header: 'en-US,en;q=0.9', expectedLang: 'en', label: 'en-US,en;q=0.9' },
    { header: 'fr-FR, vi;q=0.5', expectedLang: 'vi', label: 'fr-FR, vi;q=0.5' },
    { header: 'en;q=0.4, vi;q=0.8', expectedLang: 'vi', label: 'en;q=0.4, vi;q=0.8' },
    { header: 'vi;q=0', expectedLang: 'en', label: 'vi;q=0' },
    { header: 'vi;q=abc', expectedLang: 'en', label: 'vi;q=abc' },
    { header: 'vi;q=2', expectedLang: 'en', label: 'vi;q=2' },
    { header: 'vi;q=0x1', expectedLang: 'en', label: 'vi;q=0x1' },
    { header: 'vi;q=', expectedLang: 'en', label: 'vi;q=' },
    { header: 'vi;level=1', expectedLang: 'vi', label: 'vi;level=1' },
    { header: '*', expectedLang: 'en', label: '*' },
    { header: 'fr', expectedLang: 'en', label: 'fr' },
    { header: '', expectedLang: 'en', label: 'empty' },
    { header: ';;;', expectedLang: 'en', label: ';;;' },
    { header: 'vi' + 'a'.repeat(255), expectedLang: 'en', label: '257 chars starting with vi' },
  ];

  for (const { header, expectedLang, label } of B6_CASES) {
    it(`sets Content-Language: ${expectedLang} and Vary on success with Accept-Language: "${label}"`, async () => {
      let req = request(e2e.app.getHttpServer()).get('/api/health');
      if (header !== undefined) {
        req = req.set('Accept-Language', header);
      }
      const res = await req.expect(200);

      expect(res.headers['content-language']).toBe(expectedLang);
      expect(res.headers.vary).toContain('Accept-Language');
    });

    it(`sets Content-Language: ${expectedLang} on error with Accept-Language: "${label}"`, async () => {
      let req = request(e2e.app.getHttpServer()).get('/api/not-a-real-endpoint');
      if (header !== undefined) {
        req = req.set('Accept-Language', header);
      }
      const res = await req.expect(404);

      expect(res.headers['content-language']).toBe(expectedLang);
      expect(res.headers.vary).toContain('Accept-Language');
      expect(res.body.statusCode).toBe(404);
      if (expectedLang === 'vi') {
        expect(res.body.message).toBe('Không tìm thấy nội dung bạn cần');
      } else {
        expect(res.body.message).toBe('Cannot GET /api/not-a-real-endpoint');
      }
    });
  }

  it('handles concurrent requests with different languages without cross-contamination (INV-05, AC-19)', async () => {
    const server = e2e.app.getHttpServer();

    // Fire 10 parallel requests alternating between vi and en
    const promises = Array.from({ length: 10 }, (_, i) => {
      const isVi = i % 2 === 0;
      let req = request(server).get('/api/not-a-real-endpoint');
      if (isVi) {
        req = req.set('Accept-Language', 'vi');
      }
      return req.then((res) => ({ res, isVi, index: i }));
    });

    const results = await Promise.all(promises);

    for (const { res, isVi, index } of results) {
      expect(res.status).toBe(404);
      if (isVi) {
        expect(res.headers['content-language']).toBe('vi');
        expect(res.body.message, `Request ${index} must have Vietnamese message`).toBe(
          'Không tìm thấy nội dung bạn cần',
        );
      } else {
        expect(res.headers['content-language']).toBe('en');
        expect(res.body.message, `Request ${index} must have English message`).toBe(
          'Cannot GET /api/not-a-real-endpoint',
        );
      }
    }
  });

  it('translates validation error field messages when Accept-Language is vi', async () => {
    const resVi = await request(e2e.app.getHttpServer())
      .post('/api/auth/sign-in')
      .set('Origin', 'http://localhost:5173')
      .set('Accept-Language', 'vi')
      .send({})
      .expect(400);

    expect(resVi.headers['content-language']).toBe('vi');
    expect(resVi.body.code).toBe('VALIDATION_ERROR');
    expect(resVi.body.message).toBe('Kiểm tra các trường được đánh dấu');
  });
});
