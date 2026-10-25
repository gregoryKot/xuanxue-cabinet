// e2e «Объявление на доске» в PATCH /settings (ADR-0172): учитель пишет текст
// и последний день показа. Отдельный файл — settings.e2e-spec.ts уже у потолка
// размера. Чтение глазами ученика — board.e2e-spec.ts; доступ к /settings по
// роли — settings.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { SETTINGS_LIMITS, type SettingsDto } from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

const NOTICE = {
  text: 'Ретрит в ноябре — оплата до 20 октября Маше',
  until: '2026-10-20',
};

describe('PATCH /settings: boardNotice (e2e)', () => {
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

  function patchSettings(cookie: string, body: object) {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send(body);
  }

  async function getSettings(cookie: string): Promise<SettingsDto> {
    const res = await request(server()).get('/api/settings').set('Cookie', cookie);
    return res.body as SettingsDto;
  }

  it('на чистой базе объявления нет', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    expect((await getSettings(cookie)).boardNotice).toBeUndefined();
  });

  it('сохраняется, GET после видит его; пробелы по краям текста обрезаются', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const patched = await patchSettings(cookie, {
      boardNotice: { ...NOTICE, text: `  ${NOTICE.text} \n` },
    });
    expect(patched.status).toBe(200);
    expect((patched.body as SettingsDto).boardNotice).toEqual(NOTICE);

    expect((await getSettings(cookie)).boardNotice).toEqual(NOTICE);
  });

  it('null сбрасывает объявление, остальные настройки на месте', async () => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    await patchSettings(cookie, { previewMinutes: 15, boardNotice: NOTICE });

    const patched = await patchSettings(cookie, { boardNotice: null });
    expect(patched.status).toBe(200);

    const got = await getSettings(cookie);
    expect(got.boardNotice).toBeUndefined();
    expect(got.previewMinutes).toBe(15);
  });

  it.each<[string, object]>([
    ['пустой текст', { text: '', until: '2026-10-20' }],
    ['текст из пробелов', { text: '  \n ', until: '2026-10-20' }],
    [
      'текст длиннее предела',
      {
        text: 'x'.repeat(SETTINGS_LIMITS.boardNoticeTextMaxLength + 1),
        until: '2026-10-20',
      },
    ],
    ['без срока', { text: NOTICE.text }],
    ['срок не датой', { text: NOTICE.text, until: 'завтра' }],
    ['срок другим форматом', { text: NOTICE.text, until: '20.10.2026' }],
    ['несуществующий месяц', { text: NOTICE.text, until: '2026-13-01' }],
    ['без текста', { until: '2026-10-20' }],
  ])('%s — 400, ничего не сохраняется', async (_case, boardNotice) => {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);

    const res = await patchSettings(cookie, { boardNotice });

    expect(res.status).toBe(400);
    expect((await getSettings(cookie)).boardNotice).toBeUndefined();
  });

  it('ученик не может писать объявление — 403', async () => {
    const student = await sessionCookieFor(testApp.app, []);

    const res = await patchSettings(student, { boardNotice: NOTICE });

    expect(res.status).toBe(403);
  });
});
