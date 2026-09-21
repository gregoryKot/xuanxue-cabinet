// e2e PUT /me/no-telegram (ADR-0067): человек отмечает или снимает «у меня
// нет Telegram». Read-after-write — GET /auth/me после PUT (образец:
// me-profile.e2e-spec.ts), владение — чужой userId в теле не переносит
// отметку на другого (e2e-support/README.md, SECURITY §2), без сессии, без
// CSRF-заголовка и невалидное тело.
import request from 'supertest';
import type { ApiErrorBody, MeDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('PUT /me/no-telegram (e2e)', () => {
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

  function putNoTelegram(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).put('/api/me/no-telegram'))
      .set('Cookie', cookie)
      .send(body);
  }

  function getMe(cookie: string): request.Test {
    return request(server()).get('/api/auth/me').set('Cookie', cookie);
  }

  it('без сессии, но с x-requested-with — 401', async () => {
    const res = await withCsrf(request(server()).put('/api/me/no-telegram')).send({
      noTelegram: true,
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('с cookie, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await request(server())
      .put('/api/me/no-telegram')
      .set('Cookie', cookie)
      .send({ noTelegram: true });

    expect(res.status).toBe(403);
  });

  it('А ставит отметку — 204, GET /auth/me у А: noTelegram true, у Б — false (read-after-write)', async () => {
    const a = await createUserWithSession(testApp.app, { name: 'Ученик А', roles: [] });
    const b = await createUserWithSession(testApp.app, { name: 'Ученик Б', roles: [] });

    const put = await putNoTelegram(a.cookie, { noTelegram: true });
    expect(put.status).toBe(204);

    const meA = await getMe(a.cookie);
    expect((meA.body as MeDto).noTelegram).toBe(true);

    const meB = await getMe(b.cookie);
    expect((meB.body as MeDto).noTelegram).toBe(false);
  });

  // userId — не поле ввода (SECURITY §2): владелец — только @CurrentUser() из
  // сессии, не тело запроса. Отклонение от буквального текста задания: в
  // этом приложении глобальный ValidationPipe поднят не только с
  // `whitelist: true`, но и с `forbidNonWhitelisted: true` (app.setup.ts) —
  // лишнее поле не срезается молча, а роняет запрос целиком в 400 (тот же
  // приём и тот же результат, что в notifications-ownership.e2e-spec.ts).
  // Итог для владения тот же: подставить чужой id и переставить отметку не
  // получается — здесь это доказывается через 400, а не через «успешный»
  // 204 с обрезанным телом.
  it('чужой userId в теле — 400, не подмена (whitelist его не пропускает)', async () => {
    const a = await createUserWithSession(testApp.app, { name: 'Ученик А', roles: [] });
    const b = await createUserWithSession(testApp.app, { name: 'Ученик Б', roles: [] });

    const res = await putNoTelegram(a.cookie, { noTelegram: true, userId: b.userId });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');

    // Запрос отклонён целиком, до сервиса не дошёл — ни А, ни Б не задеты.
    const meA = await getMe(a.cookie);
    expect((meA.body as MeDto).noTelegram).toBe(false);
    const meB = await getMe(b.cookie);
    expect((meB.body as MeDto).noTelegram).toBe(false);
  });

  it('А снимает отметку — GET /auth/me снова noTelegram: false (дорога назад работает)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const first = await putNoTelegram(cookie, { noTelegram: true });
    expect(first.status).toBe(204);

    const second = await putNoTelegram(cookie, { noTelegram: false });
    expect(second.status).toBe(204);

    const me = await getMe(cookie);
    expect((me.body as MeDto).noTelegram).toBe(false);
  });

  it('кривое тело — 400', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });

    const res = await putNoTelegram(cookie, { noTelegram: 'да' });

    expect(res.status).toBe(400);
  });
});
