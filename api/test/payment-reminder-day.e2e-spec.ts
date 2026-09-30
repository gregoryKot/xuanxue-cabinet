// e2e свой день напоминания об оплате (ADR-0161) на настоящем AppModule:
// PUT /me/payments/reminder-day → GET /me/payments (read-after-write), владение
// по сессии (ученик Б чужого выбора не видит и не меняет), проверка тела (400),
// школа выключила напоминание (409 и поля `reminder` в GET нет), и тик
// планировщика шлёт только в выбранный день: кто не выбрал, не получает
// никогда, общего дня у школы нет.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  InboxPageDto,
  MyPaymentReminderDto,
  SettingsDto,
} from '@xuanxue/shared';
import { PAYMENT_REMINDER_DISABLED_MESSAGE } from '@xuanxue/shared';
import { NotificationPrefsRecord } from '../src/notifications/notification-prefs.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { PaymentReminderService } from '../src/payments/payment-reminder.service';
import { PaymentRecord } from '../src/payments/payment.schema';
import { SettingsRecord } from '../src/settings/settings.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { myPaymentsPage } from './e2e-support/my-payments';
import { createUserWithSession } from './e2e-support/session';

const OWN_DAY = 12;
const OTHER_DAY = 5;
const REMINDER_TIME = '10:00';

describe('Свой день напоминания об оплате (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    const get = <T>(name: string) =>
      testApp.app.get<Model<T>>(getModelToken(name), { strict: false });
    await Promise.all([
      get<SettingsRecord>(SettingsRecord.name).deleteMany({}),
      get<PaymentRecord>(PaymentRecord.name).deleteMany({}),
      get<NotificationRecord>(NotificationRecord.name).deleteMany({}),
      get<NotificationPrefsRecord>(NotificationPrefsRecord.name).deleteMany({}),
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  /** Школа включает (или выключает) напоминание; возвращает пояс школы. */
  async function setSchoolReminder(enabled: boolean): Promise<string> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', adminCookie)
      .send({
        paymentReminder: { enabled, time: REMINDER_TIME },
      });
    expect(res.status).toBe(200);
    return (res.body as SettingsDto).tz;
  }

  /** 10:00 по часам школы в нужный день сентября 2026. */
  function tickAt(tz: string, day: number): DateTime {
    return DateTime.fromObject(
      { year: 2026, month: 9, day, hour: 10, minute: 0 },
      { zone: tz },
    );
  }

  function putDay(cookie: string, body: unknown): request.Test {
    return withCsrf(request(server()).put('/api/me/payments/reminder-day'))
      .set('Cookie', cookie)
      .send(body as object);
  }

  it('без сессии — 401', async () => {
    const res = await withCsrf(
      request(server()).put('/api/me/payments/reminder-day'),
    ).send({ dayOfMonth: OWN_DAY });

    expect(res.status).toBe(401);
  });

  it('школа включила: без выбора — день null, PUT → GET показывает свой день, null снимает его', async () => {
    await setSchoolReminder(true);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    expect((await myPaymentsPage(testApp.app, cookie)).reminder).toEqual({
      dayOfMonth: null,
      time: REMINDER_TIME,
    });

    const put = await putDay(cookie, { dayOfMonth: OWN_DAY });
    expect(put.status).toBe(200);
    const written = put.body as MyPaymentReminderDto;
    expect(written).toEqual({ dayOfMonth: OWN_DAY, time: REMINDER_TIME });
    expect((await myPaymentsPage(testApp.app, cookie)).reminder).toEqual(written);

    const reset = await putDay(cookie, { dayOfMonth: null });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ dayOfMonth: null, time: REMINDER_TIME });
    expect((await myPaymentsPage(testApp.app, cookie)).reminder).toEqual(reset.body);
  });

  it('владение по сессии: выбор ученика А не виден и не меняется учеником Б', async () => {
    await setSchoolReminder(true);
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });

    await putDay(cookieA, { dayOfMonth: OWN_DAY });
    // Чужой userId в теле не пропускает whitelist (forbidNonWhitelisted):
    // владелец — только сессия.
    const injected = await putDay(cookieB, { dayOfMonth: 20, userId: 'чужой' });

    expect(injected.status).toBe(400);
    expect((await myPaymentsPage(testApp.app, cookieB)).reminder?.dayOfMonth).toBeNull();
    expect((await myPaymentsPage(testApp.app, cookieA)).reminder?.dayOfMonth).toBe(
      OWN_DAY,
    );

    await putDay(cookieB, { dayOfMonth: 20 });
    expect((await myPaymentsPage(testApp.app, cookieA)).reminder?.dayOfMonth).toBe(
      OWN_DAY,
    );
  });

  it.each([
    ['0', { dayOfMonth: 0 }],
    ['32', { dayOfMonth: 32 }],
    ['1.5', { dayOfMonth: 1.5 }],
    ['строка', { dayOfMonth: '5' }],
    ['нет поля', {}],
    ['отрицательный', { dayOfMonth: -1 }],
  ])('день вне 1–31 или не целое (%s) — 400, ничего не записано', async (_name, body) => {
    await setSchoolReminder(true);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await putDay(cookie, body);

    expect(res.status).toBe(400);
    expect((res.body as ApiErrorBody).code).toBe('invalid_input');
    expect((await myPaymentsPage(testApp.app, cookie)).reminder?.dayOfMonth).toBeNull();
  });

  it('границы 1 и 31 принимаются', async () => {
    await setSchoolReminder(true);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    expect((await putDay(cookie, { dayOfMonth: 1 })).status).toBe(200);
    expect((await putDay(cookie, { dayOfMonth: 31 })).status).toBe(200);
    expect((await myPaymentsPage(testApp.app, cookie)).reminder?.dayOfMonth).toBe(31);
  });

  it('школа выключила: PUT — 409 с текстом, в GET поля reminder нет', async () => {
    await setSchoolReminder(false);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    const res = await putDay(cookie, { dayOfMonth: OWN_DAY });

    expect(res.status).toBe(409);
    const body = res.body as ApiErrorBody;
    expect(body.code).toBe('conflict');
    expect(body.message).toBe(PAYMENT_REMINDER_DISABLED_MESSAGE);
    expect(await myPaymentsPage(testApp.app, cookie)).not.toHaveProperty('reminder');
  });

  it('тик планировщика шлёт в выбранный день, а в другой — нет', async () => {
    const tz = await setSchoolReminder(true);
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    await putDay(cookie, { dayOfMonth: OWN_DAY });
    const service = testApp.app.get(PaymentReminderService, { strict: false });

    expect(await service.remind(tickAt(tz, OTHER_DAY))).toEqual({ reminded: 0 });
    expect(await service.remind(tickAt(tz, OWN_DAY))).toEqual({ reminded: 1 });

    const inbox = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
    const page = inbox.body as InboxPageDto;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.kind).toBe('payment_due');
  });

  it('ученик без выбранного дня (и снявший его) не получает напоминания ни в один день', async () => {
    const tz = await setSchoolReminder(true);
    const { cookie: none } = await createUserWithSession(testApp.app, {
      name: 'Не выбирал',
      roles: [],
    });
    const { cookie: reset } = await createUserWithSession(testApp.app, {
      name: 'Снял выбор',
      roles: [],
    });
    await putDay(reset, { dayOfMonth: OWN_DAY });
    await putDay(reset, { dayOfMonth: null });
    const service = testApp.app.get(PaymentReminderService, { strict: false });

    for (let day = 1; day <= 30; day += 1) {
      expect(await service.remind(tickAt(tz, day))).toEqual({ reminded: 0 });
    }

    for (const cookie of [none, reset]) {
      const inbox = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
      expect((inbox.body as InboxPageDto).items).toHaveLength(0);
    }
  });
});
