// e2e на владение сменой своего имени (PATCH /me/profile, SECURITY §3):
// человек меняет только своё имя, чужой id в теле не проходит частично —
// глобальный ValidationPipe (whitelist + forbidNonWhitelisted, app.setup.ts)
// роняет весь запрос 400-м, не «отбрасывает поле молча и переименовывает
// отправителя». Данные человека, не школы (ADR-0010) — владение по сессии,
// не по роли: доступно и ученику, и гостю без роли. Образец и инструкция —
// api/test/e2e-support/README.md.
import type { ApiErrorBody, MeDto } from '@xuanxue/shared';
import { PROFILE_LIMITS, PROFILE_NAME_REQUIRED_MESSAGE } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Своё имя в профиле — владение (e2e)', () => {
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

  it('ученик без ролей переименовывает себя — 200, GET /auth/me отдаёт то же имя', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'doctor.martynova@gmail.com',
      roles: [],
    });

    const res = await withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookie)
      .send({ name: 'Марина Мартынова' });

    expect(res.status).toBe(200);
    expect((res.body as MeDto).name).toBe('Марина Мартынова');

    const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect((me.body as MeDto).name).toBe('Марина Мартынова');
  });

  it('имя с пробелами по краям обрезается', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Гость',
      roles: [],
    });

    const res = await withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookie)
      .send({ name: '  Аня  ' });

    expect(res.status).toBe(200);
    expect((res.body as MeDto).name).toBe('Аня');
  });

  it.each(['', '   '])('имя %j — 400 с текстом про заполнение поля', async (value) => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Гость',
      roles: [],
    });

    const res = await withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookie)
      .send({ name: value });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect((res.body as ApiErrorBody).details).toEqual(
      expect.arrayContaining([`Имя: ${PROFILE_NAME_REQUIRED_MESSAGE}`]),
    );
  });

  it(`имя длиннее ${PROFILE_LIMITS.nameMax} символов — 400, ничего не сохранилось`, async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Гость',
      roles: [],
    });

    const res = await withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookie)
      .send({ name: 'а'.repeat(PROFILE_LIMITS.nameMax + 1) });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).details).toEqual(
      expect.arrayContaining([`Имя: не длиннее ${PROFILE_LIMITS.nameMax} символов.`]),
    );

    const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect((me.body as MeDto).name).toBe('Гость');
  });

  it('владение: лишний чужой id в теле — весь запрос отклонён, чужая запись не изменилась', async () => {
    const { userId: userIdB, cookie: cookieB } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик Б', roles: [] },
    );
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });

    const res = await withCsrf(request(server()).patch('/api/me/profile'))
      .set('Cookie', cookieA)
      .send({ name: 'Новое имя А', id: userIdB });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');

    // Запрос отклонён целиком (forbidNonWhitelisted, app.setup.ts) — ни
    // отправитель, ни Б не переименованы, не только «Б не тронут».
    const meA = await request(server()).get('/api/auth/me').set('Cookie', cookieA);
    expect((meA.body as MeDto).name).toBe('Ученик А');

    const meB = await request(server()).get('/api/auth/me').set('Cookie', cookieB);
    expect((meB.body as MeDto).name).toBe('Ученик Б');
  });

  it('без сессии — 401', async () => {
    const res = await withCsrf(request(server()).patch('/api/me/profile')).send({
      name: 'Кто-то',
    });
    expect(res.status).toBe(401);
  });
});
