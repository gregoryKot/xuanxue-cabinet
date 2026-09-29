// e2e: снимок перевода, загруженный в кабинете, уходит бухгалтеру в Telegram
// (ADR-0156) — так же, как присланный боту. Настоящий AppModule на
// MongoMemoryServer, TELEGRAF_FACTORY подменена (createFakeTelegrafFactory) —
// сеть не трогаем; образцы — exam-media-send.e2e-spec.ts (подмена фабрики,
// личный чат), payment-screenshot.e2e-spec.ts (загрузка сырым телом).
// Проверяем сквозной путь: HTTP-загрузка → порт → PaymentScreenshotToAccountant
// → PersonalChats.listFor → sendPhoto байтами + подпись, а при отказе —
// строка в ленте бухгалтера (`GET /me/inbox`), которая не зависит от
// переключателя вида.
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import { formatMonthRu, type InboxPageDto, type MyPaymentDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import {
  createFakeTelegrafFactory,
  type FakeTelegraf,
} from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import { USER_MODEL_NAME } from '../src/users/user-data.registry';
import type { UserRecord } from '../src/users/user.schema';
import { NotificationRecord } from '../src/notifications/notification.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { jpegBytes } from './e2e-support/exam-images-fixtures';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { myPaymentRowsFor } from './e2e-support/my-payments';
import { createUserWithSession } from './e2e-support/session';

const STUDENT_NAME = 'Ирина Ученица';
const STUDENT_EMAIL = 'irina.student@example.com';
const ACCOUNTANT_TELEGRAM_ID = 770_101;
// Текущий месяц: окно допустимых месяцев считается от «сейчас» (ADR-0050),
// жёсткий литерал устарел бы через полгода.
const MONTH = DateTime.utc().toFormat('yyyy-LL');
const MONTH_RU = formatMonthRu(MONTH);
const FEED_TEXT = `Снимок перевода ждёт подтверждения — ${MONTH_RU}`;

// Один AppModule на файл: Node кеширует его импорт, и второй createTestApp()
// в этом же файле подключился бы к уже остановленной Mongo (см. шапку
// analytics-config.e2e-spec.ts). Отказ Telegram включается на лету — фейк
// читает флаг в момент вызова, а не при создании.
const failures = { failSendPhoto: false };
let testApp: TestApp;
let fake: FakeTelegraf;

function models() {
  const get = <T>(name: string): Model<T> =>
    testApp.app.get(getModelToken(name), { strict: false });
  return {
    users: get<UserRecord>(USER_MODEL_NAME),
    channels: get<ChannelRecord>(ChannelRecord.name),
    notifications: get<NotificationRecord>(NotificationRecord.name),
  };
}

async function clearData(): Promise<void> {
  const { users, channels, notifications } = models();
  await Promise.all([
    users.deleteMany({}),
    channels.deleteMany({}),
    notifications.deleteMany({}),
  ]);
}

async function createAccountant(options: {
  withBot: boolean;
}): Promise<{ userId: string; cookie: string }> {
  const created = await createUserWithSession(testApp.app, {
    name: 'Маша Бухгалтер',
    roles: ['accountant'],
    ...(options.withBot ? { telegramId: ACCOUNTANT_TELEGRAM_ID } : {}),
  });
  if (options.withBot) {
    await models().channels.create({
      type: 'telegram',
      title: 'Личные сообщения: Маша',
      config: '{}',
      target: String(ACCOUNTANT_TELEGRAM_ID),
      active: true,
    });
  }
  return created;
}

function uploadScreenshot(cookie: string): request.Test {
  return withCsrf(
    request(testApp.app.getHttpServer()).post(`/api/me/payments/${MONTH}/screenshot`),
  )
    .set('Cookie', cookie)
    .set('Content-Type', 'image/jpeg')
    .send(jpegBytes());
}

async function inboxOf(cookie: string): Promise<InboxPageDto> {
  const res = await request(testApp.app.getHttpServer())
    .get('/api/me/inbox')
    .set('Cookie', cookie);
  expect(res.status).toBe(200);
  return res.body as InboxPageDto;
}

async function studentSession(): Promise<string> {
  const { cookie } = await createUserWithSession(testApp.app, {
    name: STUDENT_NAME,
    roles: [],
    email: STUDENT_EMAIL,
  });
  return cookie;
}

describe('Снимок из кабинета — бухгалтеру в Telegram (e2e, ADR-0156)', () => {
  beforeAll(async () => {
    fake = createFakeTelegrafFactory(failures);
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAF_FACTORY).useValue(fake.factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    fake.sendPhotoCalls.length = 0;
    fake.sendMessageCalls.length = 0;
    await clearData();
  });

  it('загрузка → 201, бухгалтеру уходит фото байтами и подпись с именем и месяцем', async () => {
    const accountant = await createAccountant({ withBot: true });
    const studentCookie = await studentSession();

    const res = await uploadScreenshot(studentCookie);

    expect(res.status).toBe(201);
    expect(fake.sendPhotoCalls).toEqual([
      {
        chatId: String(ACCOUNTANT_TELEGRAM_ID),
        filename: `screenshot-${MONTH}.jpg`,
        hasBytes: true,
      },
    ]);
    expect(fake.sendMessageCalls).toEqual([
      {
        chatId: String(ACCOUNTANT_TELEGRAM_ID),
        text: `Скриншот от ${STUDENT_NAME} — оплата за ${MONTH_RU}.`,
        replyMarkup: undefined,
      },
    ]);
    // Дошло — строки в ленте нет: она только на случай отказа.
    await expect(inboxOf(accountant.cookie)).resolves.toMatchObject({ items: [] });
  });

  it('повторная загрузка — подпись «Новый скриншот … взамен прежнего»', async () => {
    await createAccountant({ withBot: true });
    const studentCookie = await studentSession();
    await uploadScreenshot(studentCookie);
    fake.sendMessageCalls.length = 0;

    const res = await uploadScreenshot(studentCookie);

    expect(res.status).toBe(201);
    expect(fake.sendPhotoCalls).toHaveLength(2);
    expect(fake.sendMessageCalls.map((m) => m.text)).toEqual([
      `Новый скриншот от ${STUDENT_NAME} взамен прежнего — оплата за ${MONTH_RU}.`,
    ]);
  });

  it('бухгалтер выключил вид payments — в Telegram не шлём, строка в его ленте есть', async () => {
    const accountant = await createAccountant({ withBot: true });
    const studentCookie = await studentSession();
    const patch = await withCsrf(
      request(testApp.app.getHttpServer()).patch('/api/me/notifications'),
    )
      .set('Cookie', accountant.cookie)
      .send({ kind: 'payments', enabled: false });
    expect(patch.status).toBe(200);

    const res = await uploadScreenshot(studentCookie);

    expect(res.status).toBe(201);
    expect(fake.sendPhotoCalls).toEqual([]);
    const inbox = await inboxOf(accountant.cookie);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]).toMatchObject({ kind: 'payments', text: FEED_TEXT });
    expect(inbox.unreadCount).toBe(1);
  });

  it('бухгалтер не подключил бота — загрузка 201, строка в его ленте', async () => {
    const accountant = await createAccountant({ withBot: false });
    const studentCookie = await studentSession();

    const res = await uploadScreenshot(studentCookie);

    expect(res.status).toBe(201);
    expect(fake.sendPhotoCalls).toEqual([]);
    const inbox = await inboxOf(accountant.cookie);
    expect(inbox.items.map((i) => i.text)).toEqual([FEED_TEXT]);
  });

  it('строку в ленте видит только бухгалтер: ученик и учитель её не получают', async () => {
    await createAccountant({ withBot: false });
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const studentCookie = await studentSession();

    await uploadScreenshot(studentCookie);

    await expect(inboxOf(teacherCookie)).resolves.toMatchObject({ items: [] });
    await expect(inboxOf(studentCookie)).resolves.toMatchObject({ items: [] });
  });

  describe('Telegram не принял фото', () => {
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    beforeEach(() => {
      failures.failSendPhoto = true;
      warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      failures.failSendPhoto = false;
      warn.mockRestore();
      error.mockRestore();
    });

    it('загрузка успешна, read-after-write показывает awaiting, у бухгалтера строка в ленте, в логах нет ПДн ученика', async () => {
      const accountant = await createAccountant({ withBot: true });
      const studentCookie = await studentSession();

      const res = await uploadScreenshot(studentCookie);

      expect(res.status).toBe(201);
      expect(fake.sendPhotoCalls).toEqual([]);
      // Подпись без вложения не шлём — сирота (attachment-with-caption.ts).
      expect(fake.sendMessageCalls).toEqual([]);

      const [row] = await myPaymentRowsFor(testApp.app, studentCookie, MONTH);
      expect(row).toMatchObject({
        status: 'awaiting',
        hasScreenshot: true,
      } as MyPaymentDto);

      const inbox = await inboxOf(accountant.cookie);
      expect(inbox.items.map((i) => i.text)).toEqual([FEED_TEXT]);

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('не дошёл'),
        expect.objectContaining({ month: MONTH }),
      );
      const logged = JSON.stringify(warn.mock.calls) + JSON.stringify(error.mock.calls);
      expect(logged).not.toContain(STUDENT_NAME);
      expect(logged).not.toContain(STUDENT_EMAIL);
    });
  });
});
