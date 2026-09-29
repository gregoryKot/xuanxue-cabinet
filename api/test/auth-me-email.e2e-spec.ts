// e2e на `MeDto.email` в GET /auth/me: свой подтверждённый адрес отдаётся
// владельцу сессии (ADR-0059). Отдельным файлом: auth.e2e-spec.ts упирается в
// файл-храповик (150 строк).
import request from 'supertest';
import type { MeDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createUserWithSession } from './e2e-support/session';

describe('GET /auth/me — свой адрес почты (e2e)', () => {
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

  // Баг владельца 2026-09-29: «Профиль» не называл привязанный адрес. Свой
  // адрес уходит владельцу сессии значением, у человека без почты поля нет.
  it('GET /auth/me: свой подтверждённый адрес отдаётся, без почты — email нет', async () => {
    const withEmail = await createUserWithSession(testApp.app, {
      name: 'С почтой',
      roles: [],
      email: 'me-owner@example.com',
    });
    const withoutEmail = await createUserWithSession(testApp.app, {
      name: 'Без почты',
      roles: [],
      telegramId: 700_777,
    });

    const own = await request(server())
      .get('/api/auth/me')
      .set('Cookie', withEmail.cookie);
    const bare = await request(server())
      .get('/api/auth/me')
      .set('Cookie', withoutEmail.cookie);

    expect((own.body as MeDto).email).toBe('me-owner@example.com');
    expect((own.body as MeDto).hasEmail).toBe(true);
    expect((bare.body as MeDto).email).toBeUndefined();
    expect(bare.body).not.toHaveProperty('email');
    expect((bare.body as MeDto).hasEmail).toBe(false);
  });
});
