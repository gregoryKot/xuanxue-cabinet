// e2e на GET /dev/errors (ADR-0132) — экран «Сбои» (роль `admin`, в
// интерфейсе подписана «Разработчик»). Матрица доступа — e2e-support/README.md:
// без cookie 401, без роли admin (учитель/помощник/бухгалтер/ученик) 403,
// admin 200. Read-after-write: POST /client-errors пишет отчёт, GET
// /dev/errors находит его по requestId с текстом ошибки.
import request from 'supertest';
import type { ApiErrorBody, AppErrorListDto, UserRole } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('GET /dev/errors (e2e)', () => {
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

  function getErrors(cookie: string, query = ''): request.Test {
    return request(server()).get(`/api/dev/errors${query}`).set('Cookie', cookie);
  }

  function postClientError(
    body: Record<string, unknown>,
    requestId?: string,
  ): request.Test {
    const req = withCsrf(request(server()).post('/api/client-errors')).set(
      'x-forwarded-for',
      freshIp(),
    );
    if (requestId) req.set('x-request-id', requestId);
    return req.send(body);
  }

  it('без cookie — 401', async () => {
    const res = await getErrors('');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it.each([
    ['учитель', ['teacher'] as UserRole[]],
    ['помощник учителя', ['assistant'] as UserRole[]],
    ['бухгалтер', ['accountant'] as UserRole[]],
    ['ученик', [] as UserRole[]],
  ])('%s: GET /dev/errors — 403', async (_label, roles) => {
    const cookie = await sessionCookieFor(testApp.app, roles);
    const res = await getErrors(cookie);
    expect(res.status).toBe(403);
  });

  it('admin: GET /dev/errors — 200, пустая база — items: [], last24h: 0', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await getErrors(cookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], last24h: 0 });
  });

  it('read-after-write: POST /client-errors → GET /dev/errors?requestId= находит запись с текстом', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const requestId = `req-dev-errors-${Date.now()}`;

    const reported = await postClientError(
      { kind: 'render', message: 'TypeError: oops', path: '/exams' },
      requestId,
    );
    expect(reported.status).toBe(204);

    const res = await getErrors(cookie, `?requestId=${requestId}`);
    expect(res.status).toBe(200);
    const body = res.body as AppErrorListDto;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      requestId,
      source: 'browser',
      kind: 'render',
      path: '/exams',
      text: 'TypeError: oops',
    });
  });

  it('limit=201 — 400 (потолок APP_ERROR_LIMITS.maxLimit)', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await getErrors(cookie, '?limit=201');
    expect(res.status).toBe(400);
  });

  it('неизвестный kind — 400', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await getErrors(cookie, '?kind=network');
    expect(res.status).toBe(400);
  });
});
