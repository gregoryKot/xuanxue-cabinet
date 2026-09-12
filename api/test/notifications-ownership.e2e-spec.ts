// e2e на владение настройками уведомлений (ТЗ notifications-api.md, SECURITY
// §3): ученик А переключает только себя, чужой userId в теле не проходит
// (whitelist: true, ValidationPipe). Данные человека, не школы (ADR-0010) —
// владение по сессии, не по роли: доступно и ученику, и гостю без роли.
// Образец и инструкция — api/test/e2e-support/README.md.
import type { ApiErrorBody, NotificationPrefsDto } from '@xuanxue/shared';
import request from 'supertest';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Настройки уведомлений — владение (e2e)', () => {
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

  it('А выключает своё уведомление — у Б дефолт остаётся как был', async () => {
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: ['student'],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: ['student'],
    });

    const patchA = await withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookieA)
      .send({ kind: 'teacher_message', enabled: false });
    expect(patchA.status).toBe(200);
    expect((patchA.body as NotificationPrefsDto).enabled).toEqual(['lesson_soon']);

    const getA = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', cookieA);
    expect((getA.body as NotificationPrefsDto).enabled).toEqual(['lesson_soon']);

    const getB = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', cookieB);
    expect((getB.body as NotificationPrefsDto).enabled).toEqual([
      'lesson_soon',
      'teacher_message',
    ]);
  });

  it('чужой userId в теле — 400, не подмена (whitelist: true его не пропускает)', async () => {
    const { userId: userIdB, cookie: cookieB } = await createUserWithSession(
      testApp.app,
      { name: 'Ученик Б', roles: ['student'] },
    );
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: ['student'],
    });

    const res = await withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookieA)
      .send({ kind: 'teacher_message', enabled: false, userId: userIdB });

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');

    // Настройки Б не тронуты — А и не должен был до них дотянуться.
    const getB = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', cookieB);
    expect((getB.body as NotificationPrefsDto).enabled).toEqual([
      'lesson_soon',
      'teacher_message',
    ]);
  });

  it('гость без единой роли — доступ есть, дефолт как у ученика', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Гость',
      roles: [],
    });

    const res = await request(server())
      .get('/api/me/notifications')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as NotificationPrefsDto).enabled).toEqual([
      'lesson_soon',
      'teacher_message',
    ]);
  });

  it('без сессии — 401 на обоих маршрутах', async () => {
    const get = await request(server()).get('/api/me/notifications');
    expect(get.status).toBe(401);

    const patch = await withCsrf(request(server()).patch('/api/me/notifications')).send({
      kind: 'lesson_soon',
      enabled: false,
    });
    expect(patch.status).toBe(401);
  });
});
