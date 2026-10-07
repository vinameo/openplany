import request from 'supertest';
import { createE2eApp, type E2eApp } from './createE2eApp.js';

describe('AppController (e2e)', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });

  afterAll(async () => {
    await e2e.app.close();
  });

  it('GET /api/health reports ok', async () => {
    const response = await request(e2e.app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'api' });
  });

  it('answers unknown routes in the api error format', async () => {
    const response = await request(e2e.app.getHttpServer())
      .get('/api/nope')
      .expect(404);

    expect(response.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(response.body.requestId).toEqual(expect.any(String));
  });
});
