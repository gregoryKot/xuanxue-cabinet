// e2e GET /auth/config с BOT_TOKEN — отдельный файл от auth-config.e2e-spec.ts
// (см. комментарий там про кеш импорта AppModule). TEST_BOT_TOKEN
// (create-app.ts) начинается с "123456:" — числовой id бота предсказуем.
// Read-after-write на schoolSiteUrl (PATCH /settings учителем → виден всем
// в GET /auth/config без cookie, В6 аудита) — в этом же файле: два разных
// AppModule на файл (см. auth-config.e2e-spec.ts) не нужны, а PATCH требует
// учителя, для которого BOT_TOKEN не важен.
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import type { ApiErrorBody, AuthConfigDto } from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('GET /auth/config (e2e), с BOT_TOKEN', () => {
  let testApp: TestApp;
  let settingsModel: Model<SettingsRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    settingsModel = testApp.app.get<Model<SettingsRecord>>(
      getModelToken(SettingsRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  it('200 без cookie, telegramBotId есть, schoolSiteUrl не задан — поля нет', async () => {
    const res = await request(server()).get('/api/auth/config');

    expect(res.status).toBe(200);
    const body = res.body as AuthConfigDto;
    expect(body.telegramBotId).toBe(123456);
    expect(body.schoolSiteUrl).toBeUndefined();
    // Без RESEND_API_KEY/MAIL_FROM в этом файле — emailLoginEnabled всегда
    // false, но поле всё равно присутствует (не опционально, shared/src/auth.ts).
    // То же у fileStorageEnabled: без четырёх переменных R2 (ADR-0057) он
    // false, а не отсутствует.
    expect(body.emailLoginEnabled).toBe(false);
    expect(body.fileStorageEnabled).toBe(false);
    expect(Object.keys(body)).toEqual([
      'telegramBotId',
      'emailLoginEnabled',
      'fileStorageEnabled',
    ]);
  });

  it('read-after-write: учитель сохранил schoolSiteUrl — гость видит его в /auth/config без cookie', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const patched = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: 'https://xuanxue.su' });
    expect(patched.status).toBe(200);

    const res = await request(server()).get('/api/auth/config');

    expect((res.body as AuthConfigDto).schoolSiteUrl).toBe('https://xuanxue.su');
  });

  it('PATCH /settings с http:// — 400 по-русски, ничего не сохранилось', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ schoolSiteUrl: 'http://xuanxue.su' });

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.message).toBe('Проверьте, пожалуйста, введённые данные.');
    expect(body.details).toEqual(
      expect.arrayContaining(['Адрес сайта школы: должна начинаться с https://.']),
    );

    const config = await request(server()).get('/api/auth/config');
    expect((config.body as AuthConfigDto).schoolSiteUrl).toBeUndefined();
  });
});
