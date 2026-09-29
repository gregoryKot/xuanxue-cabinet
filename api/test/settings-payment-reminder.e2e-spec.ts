// e2e на PATCH /settings.paymentReminder (ADR-0051). Данные школы (ADR-0010):
// доступ по роли, не по владельцу — те же права, что у остальных полей
// настроек (settings.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
  DEFAULT_PAYMENT_REMINDER,
  type ApiErrorBody,
  type SettingsDto,
  type UserRole,
} from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Settings paymentReminder (e2e)', () => {
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
    // Документ школы один (_id фиксирован): без очистки следующий тест
    // увидел бы чужие настройки вместо дефолта.
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  async function patch(cookie: string, body: object): Promise<request.Response> {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('GET /settings — напоминание по умолчанию, выключено', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await request(server()).get('/api/settings').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect((res.body as SettingsDto).paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  it('PATCH меняет переданные поля — ответ и следующий GET совпадают, шаблон не тронут', async () => {
    const cookie = await sessionFor(['teacher']);
    const expected = {
      ...DEFAULT_PAYMENT_REMINDER,
      enabled: true,
      dayOfMonth: 31,
      time: '09:30',
    };

    const patched = await patch(cookie, {
      paymentReminder: { enabled: true, dayOfMonth: 31, time: '09:30' },
    });
    const got = await request(server()).get('/api/settings').set('Cookie', cookie);

    expect(patched.status).toBe(200);
    expect((patched.body as SettingsDto).paymentReminder).toEqual(expected);
    expect((got.body as SettingsDto).paymentReminder).toEqual(expected);
    expect((got.body as SettingsDto).paymentReminder.template).toBe(
      DEFAULT_PAYMENT_REMINDER.template,
    );
  });

  it('PATCH { paymentReminder: {} } — 200, ничего не меняется', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await patch(cookie, { paymentReminder: {} });

    expect(res.status).toBe(200);
    expect((res.body as SettingsDto).paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  // День 0 и 32 — за границами SETTINGS_LIMITS; 1.5 — не целое; время без
  // ведущего нуля и 24:00 не проходят RULE_TIME_RE; null — сбросить нечем;
  // `{название}` — подстановка поста, у напоминания её нет; пустой текст и
  // не-булево `enabled` — тоже отказ.
  it.each<[string, object]>([
    ['день 0', { dayOfMonth: 0 }],
    ['день 32', { dayOfMonth: 32 }],
    ['день дробью', { dayOfMonth: 1.5 }],
    ['день null', { dayOfMonth: null }],
    ['время 9:30', { time: '9:30' }],
    ['время 24:00', { time: '24:00' }],
    ['enabled строкой', { enabled: 'yes' }],
    ['пустой текст', { template: '   ' }],
    ['подстановка поста', { template: 'Здравствуйте, {название}' }],
  ])('%s — 400, ничего не сохраняется', async (_name, reminder) => {
    const cookie = await sessionFor(['teacher']);

    const res = await patch(cookie, { paymentReminder: reminder });

    expect(res.status).toBe(400);
    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).paymentReminder).toEqual(DEFAULT_PAYMENT_REMINDER);
  });

  it('неизвестная подстановка — текст ошибки называет её и доступные', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await patch(cookie, { paymentReminder: { template: '{название}' } });

    const message = (res.body as ApiErrorBody).message;
    expect(message).toContain('{название}');
    expect(message).toContain('{месяц}, {сумма}, {имя}, {ссылка}');
  });

  it('права те же, что у остальных настроек: помощник и админ могут, ученик и аноним — нет', async () => {
    const assistant = await patch(await sessionFor(['assistant']), {
      paymentReminder: { dayOfMonth: 10 },
    });
    const admin = await patch(await sessionFor(['admin']), {
      paymentReminder: { dayOfMonth: 11 },
    });
    const student = await patch(await sessionFor([]), {
      paymentReminder: { enabled: true },
    });
    const anon = await withCsrf(request(server()).patch('/api/settings')).send({
      paymentReminder: { enabled: true },
    });

    expect(assistant.status).toBe(200);
    expect(admin.status).toBe(200);
    expect(student.status).toBe(403);
    expect(anon.status).toBe(401);
    const got = await request(server())
      .get('/api/settings')
      .set('Cookie', await sessionFor(['teacher']));
    expect((got.body as SettingsDto).paymentReminder).toEqual({
      ...DEFAULT_PAYMENT_REMINDER,
      dayOfMonth: 11,
    });
  });
});
