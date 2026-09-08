import request from 'supertest';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
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

  // create-app.ts не задаёт RAILWAY_GIT_COMMIT_SHA (её ставит только Railway
  // и docker-смок CI, RUNBOOK §2 п.1) — в e2e поле должно реально отсутствовать
  // в теле JSON-ответа, не просто быть undefined в объекте до сериализации
  // (health.controller.spec.ts проверяет это на уровне контроллера).
  it('GET /api/health — без RAILWAY_GIT_COMMIT_SHA поля commit нет в теле ответа', async () => {
    const res = await request(server()).get('/api/health');

    expect('commit' in (res.body as HealthStatus)).toBe(false);
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

  // Отдельное приложение: закрываем его соединение с Mongo, восстанавливать
  // не нужно — тест закрывает testApp целиком в finally (см. задачу PR).
  it('GET /api/health — 503, degraded, mongo down, когда соединение с Mongo закрыто', async () => {
    const downApp = await createTestApp();
    try {
      const connection = downApp.app.get<Connection>(getConnectionToken());
      await connection.close();

      const res = await request(downApp.app.getHttpServer()).get('/api/health');

      expect(res.status).toBe(503);
      const body = res.body as HealthStatus;
      expect(body).toMatchObject({ status: 'degraded', mongo: 'down' });
    } finally {
      // Соединение уже закрыто вручную — app.close() не должен падать на
      // повторном закрытии, но на всякий случай не даём этому уронить тест.
      await downApp.close().catch(() => undefined);
    }
  }, 60_000);
});
