// e2e PATCH /me/profile (ADR-0044, «Мягкий первый вход»): человек называет
// себя сам на первом входе. Read-after-write — GET /auth/me после PATCH
// (образец: auth-bot-chat-active.e2e-spec.ts), владение — правка одного не
// меняет имя другого (e2e-support/README.md), без сессии и невалидное тело.
import request from 'supertest';
import { PERSON_NAME_PART_MAX, type ApiErrorBody, type MeDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('PATCH /me/profile (e2e)', () => {
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

  function patchProfile(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookie)
      .send(body);
  }

  function getMe(cookie: string): request.Test {
    return request(server()).get('/api/auth/me').set('Cookie', cookie);
  }

  // roles: [] — ученик (ADR-0026), ровно та роль, для которой сделан экран
  // `/welcome`: маршрут не за @Roles (CLAUDE.md «Ноль нагрузки на ученика»).
  it('склеенное имя и needsProfile: false сразу в ответе PATCH (read-after-write)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });

    const patched = await patchProfile(cookie, {
      firstName: 'Анна',
      lastName: 'Петрова',
    });
    expect(patched.status).toBe(200);
    const body = patched.body as MeDto;
    expect(body.name).toBe('Анна Петрова');
    expect(body.needsProfile).toBe(false);

    const me = await getMe(cookie);
    expect(me.status).toBe(200);
    expect((me.body as MeDto).name).toBe('Анна Петрова');
  });

  // Экран `/welcome` кладёт тело ответа PATCH прямо на себя, без GET следом
  // (ADR-0087): неполный ответ — не «на одно поле меньше», а сломанный
  // AuthProvider (web/src/auth/AuthProvider.tsx, applyMe ждёт целый MeDto).
  // Тела сверяются целиком, новое поле MeDto попадёт под гейт само.
  it('PATCH /me/profile — тело ответа равно телу GET /auth/me сразу после (ADR-0087)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });

    const patched = await patchProfile(cookie, { firstName: 'Анна' });
    expect(patched.status).toBe(200);

    const got = await getMe(cookie);
    expect(got.status).toBe(200);
    expect(patched.body).toEqual(got.body);
  });

  it('владение: правка пользователем Б не меняет имени пользователя А', async () => {
    const a = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });
    const b = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });

    const patched = await patchProfile(b.cookie, { firstName: 'Борис' });
    expect(patched.status).toBe(200);

    const meA = await getMe(a.cookie);
    expect((meA.body as MeDto).name).toBe('Новый ученик');
    expect((meA.body as MeDto).needsProfile).toBe(true);
  });

  it('без сессии — 401', async () => {
    const res = await withCsrf(request(server()).patch('/api/me/profile')).send({
      firstName: 'Аноним',
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('пустое firstName — 400', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });

    const res = await patchProfile(cookie, { firstName: '' });

    expect(res.status).toBe(400);
  });

  it('firstName длиннее PERSON_NAME_PART_MAX — 400', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Новый ученик',
      roles: [],
    });

    const res = await patchProfile(cookie, {
      firstName: 'а'.repeat(PERSON_NAME_PART_MAX + 1),
    });

    expect(res.status).toBe(400);
  });
});
