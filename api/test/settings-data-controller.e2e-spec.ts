// e2e на «Кто отвечает за данные» в PATCH /settings: имя и способ связи для
// страницы /privacy (статья 11 Закона о защите частной жизни Израиля). Данные
// школы (ADR-0010): доступ по роли, не по владельцу (e2e-support/README.md).
// Отдельный файл от settings.e2e-spec.ts — тот уже у потолка размера
// (check-file-size-ratchet). Публичная сторона (GET /auth/config) —
// auth-config-telegram-bot.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { SETTINGS_LIMITS, type SettingsDto, type UserRole } from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('PATCH /settings: dataControllerName / dataControllerContact (e2e)', () => {
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

  // Документ школы один (_id фиксирован) — без очистки следующий тест увидел
  // бы чужое имя.
  afterEach(async () => {
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  async function patchSettings(cookie: string, body: object) {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function getSettings(cookie: string): Promise<SettingsDto> {
    const res = await request(server()).get('/api/settings').set('Cookie', cookie);
    return res.body as SettingsDto;
  }

  it('оба поля — GET после видит их, остальные настройки не тронуты (read-after-write)', async () => {
    const cookie = await sessionFor(['teacher']);
    const before = await getSettings(cookie);

    const patched = await patchSettings(cookie, {
      dataControllerName: 'Дмитрий Дейч',
      dataControllerContact: 'privacy@xuanxue.su',
    });
    expect(patched.status).toBe(200);

    const got = await getSettings(cookie);
    expect(got.dataControllerName).toBe('Дмитрий Дейч');
    expect(got.dataControllerContact).toBe('privacy@xuanxue.su');
    expect(got.templates).toEqual(before.templates);
    expect(got.newcomerContact).toBe(before.newcomerContact);
    expect(got.previewMinutes).toBe(before.previewMinutes);
  });

  // Публичный текст хранится без пробелов по краям: гость увидит ровно то, что
  // ушло на страницу /privacy.
  it('пробелы по краям обрезаются при сохранении', async () => {
    const cookie = await sessionFor(['teacher']);

    const patched = await patchSettings(cookie, {
      dataControllerName: '  Дмитрий Дейч \n',
      dataControllerContact: ' @dmitry ',
    });
    expect(patched.status).toBe(200);

    const got = await getSettings(cookie);
    expect(got.dataControllerName).toBe('Дмитрий Дейч');
    expect(got.dataControllerContact).toBe('@dmitry');
  });

  it('null снимает оба поля — GET после видит, что их нет', async () => {
    const cookie = await sessionFor(['teacher']);
    await patchSettings(cookie, {
      dataControllerName: 'Дмитрий Дейч',
      dataControllerContact: '@dmitry',
    });

    const patched = await patchSettings(cookie, {
      dataControllerName: null,
      dataControllerContact: null,
    });
    expect(patched.status).toBe(200);

    const got = await getSettings(cookie);
    expect(got.dataControllerName).toBeUndefined();
    expect(got.dataControllerContact).toBeUndefined();
  });

  // Пустота и слишком длинный текст — 400, в публичную страницу они не
  // должны уехать: вместо честного «спросите учителя» там была бы пустая строка.
  it.each<[string, Record<string, string>]>([
    ['пустое имя', { dataControllerName: '' }],
    ['имя из пробелов', { dataControllerName: '   \n ' }],
    [
      'имя длиннее предела',
      { dataControllerName: 'x'.repeat(SETTINGS_LIMITS.dataControllerNameMaxLength + 1) },
    ],
    ['пустой контакт', { dataControllerContact: '' }],
    [
      'контакт длиннее предела',
      {
        dataControllerContact: 'x'.repeat(
          SETTINGS_LIMITS.dataControllerContactMaxLength + 1,
        ),
      },
    ],
  ])('%s — 400, ничего не сохраняется', async (_case, body) => {
    const cookie = await sessionFor(['teacher']);

    const res = await patchSettings(cookie, body);

    expect(res.status).toBe(400);
    const got = await getSettings(cookie);
    expect(got.dataControllerName).toBeUndefined();
    expect(got.dataControllerContact).toBeUndefined();
  });

  it('ученик не может записать ответственного — 403, поля не появились', async () => {
    const student = await sessionFor([]);

    const res = await patchSettings(student, { dataControllerName: 'Самозванец' });

    expect(res.status).toBe(403);
    const got = await getSettings(await sessionFor(['teacher']));
    expect(got.dataControllerName).toBeUndefined();
  });
});
