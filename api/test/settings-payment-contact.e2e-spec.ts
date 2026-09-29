// e2e настройки «Кому присылать скриншот перевода» (ADR-0159): контакт
// бухгалтера живёт в БД и меняется на экране «Шаблоны». Отдельный файл, а не
// ещё один describe в settings.e2e-spec.ts: тот уже выше порога размера.
// Доступ к /settings по роли — settings.e2e-spec.ts; здесь read-after-write и
// границы значения, а главное — что ученик, которому /settings закрыт, видит
// тот же контакт в своём /me/payments.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import {
  DEFAULT_PAYMENT_CONTACT,
  SETTINGS_LIMITS,
  type SettingsDto,
  type UserRole,
} from '@xuanxue/shared';
import { SettingsRecord } from '../src/settings/settings.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { myPaymentsPage } from './e2e-support/my-payments';
import { createUserWithSession } from './e2e-support/session';

const NEW_CONTACT = 'Кате @katya_books';

describe('Settings paymentContact (e2e)', () => {
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

  // PATCH меняет документ школы (_id фиксирован) — без очистки следующий тест
  // увидел бы чужой контакт вместо дефолта.
  afterEach(async () => {
    await settingsModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function patchContact(cookie: string, value: string) {
    return withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', cookie)
      .send({ paymentContact: value });
  }

  async function settingsFor(
    roles: UserRole[],
  ): Promise<{ cookie: string; dto: SettingsDto }> {
    const cookie = await sessionCookieFor(testApp.app, roles);
    const res = await request(server()).get('/api/settings').set('Cookie', cookie);
    return { cookie, dto: res.body as SettingsDto };
  }

  it('GET /settings на чистой базе — дефолтный контакт бухгалтера', async () => {
    const { dto } = await settingsFor(['teacher']);

    expect(dto.paymentContact).toBe(DEFAULT_PAYMENT_CONTACT);
  });

  it('PATCH: значение сохраняется, GET после видит его (read-after-write)', async () => {
    const { cookie } = await settingsFor(['teacher']);

    const patched = await patchContact(cookie, NEW_CONTACT);
    expect(patched.status).toBe(200);
    expect((patched.body as SettingsDto).paymentContact).toBe(NEW_CONTACT);

    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).paymentContact).toBe(NEW_CONTACT);
  });

  // Пустой контакт оборвал бы фразу «пришлите … в Telegram» в напоминании на
  // полуслове: те же три случая, что у newcomerContact (settings.e2e-spec.ts).
  it.each<[string, string]>([
    ['пустая строка', ''],
    ['одни пробелы и переводы строк', '   \n  '],
    ['длиннее предела', 'x'.repeat(SETTINGS_LIMITS.paymentContactMaxLength + 1)],
  ])('%s — 400, ничего не сохраняется', async (_case, value) => {
    const { cookie } = await settingsFor(['teacher']);

    const res = await patchContact(cookie, value);

    expect(res.status).toBe(400);
    const got = await request(server()).get('/api/settings').set('Cookie', cookie);
    expect((got.body as SettingsDto).paymentContact).toBe(DEFAULT_PAYMENT_CONTACT);
  });

  it('ученику /settings закрыт, но контакт он видит в /me/payments — и после смены тоже', async () => {
    const { cookie: studentCookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const forbidden = await request(server())
      .get('/api/settings')
      .set('Cookie', studentCookie);
    expect(forbidden.status).toBe(403);

    expect((await myPaymentsPage(testApp.app, studentCookie)).contact).toBe(
      DEFAULT_PAYMENT_CONTACT,
    );

    expect((await patchContact(adminCookie, NEW_CONTACT)).status).toBe(200);

    expect((await myPaymentsPage(testApp.app, studentCookie)).contact).toBe(NEW_CONTACT);
  });
});
