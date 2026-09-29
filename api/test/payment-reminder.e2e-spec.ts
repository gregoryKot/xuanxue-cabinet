// e2e read-after-write напоминания об оплате (ADR-0150) на настоящем
// AppModule: школа включает напоминание через PATCH /settings, шаг тика пишет
// строку в ленту ученика без Telegram-чата, GET /me/inbox её показывает. Строка
// принадлежит ученику (ADR-0010): другой ученик её не видит (SECURITY §3).
// Шаг вызывается напрямую с явным `now` — cron в e2e выключен (create-app.ts).
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { InboxPageDto, SettingsDto } from '@xuanxue/shared';
import { PaymentReminderService } from '../src/payments/payment-reminder.service';
import { PaymentRecord } from '../src/payments/payment.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { SettingsRecord } from '../src/settings/settings.schema';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

// День и час напоминания — то, что школа выбирает на экране «Шаблоны».
const REMINDER_DAY = 5;
const REMINDER_TIME = '10:00';

describe('Напоминание об оплате — запись и чтение ленты (e2e)', () => {
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
      get<UserRecord>(USER_MODEL_NAME).deleteMany({}),
    ]);
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  /** Школа включает напоминание — и возвращает момент отправки в UTC, посчитанный
   * в поясе, который отдал сам сервер (тест не гадает про tz по умолчанию). */
  async function enableReminder(): Promise<DateTime> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).patch('/api/settings'))
      .set('Cookie', adminCookie)
      .send({
        paymentReminder: { enabled: true, dayOfMonth: REMINDER_DAY, time: REMINDER_TIME },
      });
    expect(res.status).toBe(200);
    const { tz } = res.body as SettingsDto;
    return DateTime.fromObject(
      { year: 2026, month: 9, day: REMINDER_DAY, hour: 10, minute: 0 },
      { zone: tz },
    ).toUTC();
  }

  async function inboxOf(cookie: string): Promise<InboxPageDto> {
    const res = await request(server()).get('/api/me/inbox').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as InboxPageDto;
  }

  it('ученик без чата с ботом: шаг тика → строка в GET /me/inbox, чужой ученик её не видит', async () => {
    const dueAt = await enableReminder();
    const { cookie: cookieA } = await createUserWithSession(testApp.app, {
      name: 'Ученик А',
      roles: [],
    });
    const { cookie: cookieB } = await createUserWithSession(testApp.app, {
      name: 'Ученик Б',
      roles: [],
    });
    // Б выключил вид: его строки в ленте быть не должно вовсе.
    const off = await withCsrf(request(server()).patch('/api/me/notifications'))
      .set('Cookie', cookieB)
      .send({ kind: 'payment_due', enabled: false });
    expect(off.status).toBe(200);

    const result = await testApp.app
      .get(PaymentReminderService, { strict: false })
      .remind(dueAt);

    expect(result).toEqual({ reminded: 1 });
    const inboxA = await inboxOf(cookieA);
    expect(inboxA.unreadCount).toBe(1);
    expect(inboxA.items).toHaveLength(1);
    expect(inboxA.items[0]?.kind).toBe('payment_due');
    expect(inboxA.items[0]?.text).toBe('Напоминание об оплате — сентябрь 2026');
    expect(await inboxOf(cookieB)).toEqual({ items: [], unreadCount: 0 });
  });

  it('второй тик в ту же минуту не заводит вторую строку', async () => {
    const dueAt = await enableReminder();
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });
    const service = testApp.app.get(PaymentReminderService, { strict: false });

    await service.remind(dueAt);
    await service.remind(dueAt);

    expect((await inboxOf(cookie)).items).toHaveLength(1);
  });

  it('пока школа не включила напоминание, лента пуста', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ученик',
      roles: [],
    });

    await testApp.app
      .get(PaymentReminderService, { strict: false })
      .remind(DateTime.fromISO('2026-09-05T07:00:00Z', { zone: 'utc' }));

    expect(await inboxOf(cookie)).toEqual({ items: [], unreadCount: 0 });
  });
});
