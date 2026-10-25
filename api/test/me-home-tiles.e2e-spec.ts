// e2e PUT /me/home-tiles (ADR-0179): человек выбирает, какие плитки «Главной»
// скрыть у себя. Read-after-write — GET /auth/me после PUT; владение — чужой
// userId в теле не переставляет плитки другому, второй человек не затронут
// (e2e-support/README.md, SECURITY §2). Образец — me-no-telegram.e2e-spec.ts.
import request from 'supertest';
import type { ApiErrorBody, MeDto, UserRole } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('PUT /me/home-tiles (e2e)', () => {
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

  function putTiles(cookie: string, body: Record<string, unknown>): request.Test {
    return withCsrf(request(server()).put('/api/me/home-tiles'))
      .set('Cookie', cookie)
      .send(body);
  }

  function getMe(cookie: string): request.Test {
    return request(server()).get('/api/auth/me').set('Cookie', cookie);
  }

  function signIn(
    name: string,
    roles: UserRole[] = [],
  ): ReturnType<typeof createUserWithSession> {
    return createUserWithSession(testApp.app, { name, roles });
  }

  it('без сессии, но с x-requested-with — 401', async () => {
    const res = await withCsrf(request(server()).put('/api/me/home-tiles')).send({
      hidden: [],
    });

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('с cookie, но без x-requested-with — 403 (CSRF раньше сессии)', async () => {
    const { cookie } = await signIn('Ученик');

    const res = await request(server())
      .put('/api/me/home-tiles')
      .set('Cookie', cookie)
      .send({ hidden: ['payment'] });

    expect(res.status).toBe(403);
  });

  it('до первой записи скрытого нет', async () => {
    const { cookie } = await signIn('Ученик');

    const me = await getMe(cookie);

    expect((me.body as MeDto).homeHiddenTiles).toEqual([]);
  });

  it('А прячет оплату — ответ PUT и GET /auth/me равны и несут её, у Б пусто', async () => {
    const a = await signIn('Ученик А');
    const b = await signIn('Ученик Б');

    const put = await putTiles(a.cookie, { hidden: ['payment'] });

    expect(put.status).toBe(200);
    expect((put.body as MeDto).homeHiddenTiles).toEqual(['payment']);
    expect((put.body as MeDto).id).toBe(a.userId);
    const meA = await getMe(a.cookie);
    expect(meA.body).toEqual(put.body);
    const meB = await getMe(b.cookie);
    expect((meB.body as MeDto).homeHiddenTiles).toEqual([]);
  });

  it('штат прячет свои плитки: роли в ответе целые, список сохранён', async () => {
    const { cookie } = await signIn('Мария', ['teacher']);

    const put = await putTiles(cookie, { hidden: ['grading', 'notice'] });

    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      roles: ['teacher'],
      homeHiddenTiles: ['notice', 'grading'],
    });
  });

  it('дубли схлопываются', async () => {
    const { cookie } = await signIn('Ученик');

    const put = await putTiles(cookie, { hidden: ['events', 'events', 'exams'] });

    expect(put.status).toBe(200);
    expect((put.body as MeDto).homeHiddenTiles).toEqual(['exams', 'events']);
  });

  it('пустой список возвращает все плитки', async () => {
    const { cookie } = await signIn('Ученик');
    await putTiles(cookie, { hidden: ['payment', 'events'] });

    const put = await putTiles(cookie, { hidden: [] });

    expect(put.status).toBe(200);
    expect((put.body as MeDto).homeHiddenTiles).toEqual([]);
    const me = await getMe(cookie);
    expect((me.body as MeDto).homeHiddenTiles).toEqual([]);
  });

  it('неизвестный ключ — 400, прежний выбор на месте', async () => {
    const { cookie } = await signIn('Ученик');
    await putTiles(cookie, { hidden: ['payment'] });

    const res = await putTiles(cookie, { hidden: ['payment', 'lessons'] });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    const me = await getMe(cookie);
    expect((me.body as MeDto).homeHiddenTiles).toEqual(['payment']);
  });

  it('кривое тело — 400: не список, нет поля, слишком длинный список', async () => {
    const { cookie } = await signIn('Ученик');

    expect((await putTiles(cookie, { hidden: 'payment' })).status).toBe(400);
    expect((await putTiles(cookie, {})).status).toBe(400);
    const tooMany = Array.from({ length: 7 }, () => 'payment');
    expect((await putTiles(cookie, { hidden: tooMany })).status).toBe(400);
  });

  // userId — не поле ввода (SECURITY §2): владелец только @CurrentUser() из
  // сессии. Глобальный ValidationPipe с `forbidNonWhitelisted` роняет лишнее
  // поле в 400, а не срезает молча (тот же приём, что в
  // me-no-telegram.e2e-spec.ts): подставить чужой id не получается.
  it('чужой userId в теле — 400, ни А, ни Б не задеты', async () => {
    const a = await signIn('Ученик А');
    const b = await signIn('Ученик Б');

    const res = await putTiles(a.cookie, { hidden: ['payment'], userId: b.userId });

    expect(res.status).toBe(400);
    expect(((await getMe(a.cookie)).body as MeDto).homeHiddenTiles).toEqual([]);
    expect(((await getMe(b.cookie)).body as MeDto).homeHiddenTiles).toEqual([]);
  });
});
