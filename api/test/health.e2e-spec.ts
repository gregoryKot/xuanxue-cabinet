import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import type { HealthStatus } from '../src/health/health.controller';
import { createTestApp, type TestApp } from './e2e-support/create-app';

describe('Health (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('GET /api/health — 200, mongo up, x-request-id в ответе', async () => {
    const res = await request(server()).get('/api/health');

    expect(res.status).toBe(200);
    const body = res.body as HealthStatus;
    expect(body).toMatchObject({ status: 'ok', mongo: 'up' });
    expect(typeof body.uptimeSec).toBe('number');
    const requestId = res.headers['x-request-id'];
    expect(typeof requestId).toBe('string');
    expect((requestId as string).length).toBeGreaterThan(0);
  });

  it('GET /api/nope — 404 в едином конверте ошибок, с code и requestId', async () => {
    const res = await request(server()).get('/api/nope');

    expect(res.status).toBe(404);
    const body = res.body as ApiErrorBody;
    expect(body).toMatchObject({ statusCode: 404, code: 'not_found' });
    expect(typeof body.requestId).toBe('string');
    expect(body.requestId?.length).toBeGreaterThan(0);
    // requestId в теле совпадает с заголовком — тот же запрос, тот же id.
    expect(body.requestId).toBe(res.headers['x-request-id']);
  });

  it('переданный клиентом x-request-id пробрасывается в ответ без изменений', async () => {
    const res = await request(server())
      .get('/api/health')
      .set('x-request-id', 'trace-42');

    expect(res.headers['x-request-id']).toBe('trace-42');
  });
});
