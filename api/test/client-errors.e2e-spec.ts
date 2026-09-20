// e2e на POST /client-errors (ADR-0071) — отчёт браузера о сбое: открыт
// всему интернету (падает браузер и до входа), но CSRF всё равно обязателен
// (SECURITY §2), а лишние/неизвестные поля отклоняет тот же ValidationPipe,
// что и у остального API.
import request from 'supertest';
import type { ApiErrorBody } from '@xuanxue/shared';
import { CLIENT_ERROR_LIMITS } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';

// Свой IP на запрос — троттлинг эндпоинта строже общего (5/мин, CLAUDE.md
// правило №4), делить его между тестами одного файла нельзя (тот же приём,
// что в auth-join.e2e-spec.ts).
let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /client-errors (e2e)', () => {
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

  function post(body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).post('/api/client-errors'))
      .set('x-forwarded-for', freshIp())
      .send(body);
  }

  it('валидное тело без сессии — 204, тело ответа пустое (эндпоинт публичный)', async () => {
    const res = await post({
      kind: 'render',
      message: 'TypeError: oops',
      path: '/exams',
    });

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  it('без x-requested-with — отказ CSRF-гварда, публичность маршрута не освобождает от него', async () => {
    const res = await request(server())
      .post('/api/client-errors')
      .set('x-forwarded-for', freshIp())
      .send({ kind: 'render', message: 'x', path: '/exams' });

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).code).toBe('forbidden');
  });

  it('лишнее поле (stack) — 400, forbidNonWhitelisted', async () => {
    const res = await post({
      kind: 'render',
      message: 'x',
      path: '/exams',
      stack: 'at foo (bar.js:1:1)',
    });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
  });

  it('неизвестный kind — 400', async () => {
    const res = await post({ kind: 'network', message: 'x', path: '/exams' });

    expect(res.status).toBe(400);
  });

  it('path — внешняя ссылка вместо адреса экрана — 400 (регулярка адреса)', async () => {
    const res = await post({
      kind: 'render',
      message: 'x',
      path: 'https://evil.example/x',
    });

    expect(res.status).toBe(400);
  });

  it('message длиннее CLIENT_ERROR_LIMITS.fieldHardMax — 400', async () => {
    const res = await post({
      kind: 'render',
      message: 'x'.repeat(CLIENT_ERROR_LIMITS.fieldHardMax + 1),
      path: '/exams',
    });

    expect(res.status).toBe(400);
  });
});
