// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// получает снимок — дело PersonalChats.listFor против настоящих пользователей,
// каналов и переключателей; строка ленты — против настоящего уникального
// индекса. Telegram — фейк без сети, отправка через callApi (с таймаутом,
// handlers/attachment-with-caption.ts).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Telegram } from 'telegraf';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import {
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { PaymentScreenshotToAccountant } from './payment-screenshot-to-accountant';
import { PersonalChats } from './personal-chats';

const NOW = DateTime.fromISO('2026-09-15T09:00:00Z', { zone: 'utc' });
const STUDENT_USER_ID = '507f1f77bcf86cd799439011';
const STUDENT_NAME = 'Ученик Иванов';
const BASE = {
  studentUserId: STUDENT_USER_ID,
  studentName: STUDENT_NAME,
  month: '2026-09',
  replaced: false,
  now: NOW,
};

interface FakeTelegram {
  telegram: Telegram;
  photoTo: string[];
  captions: { chatId: string; text: string }[];
}

/** `failChats` — чаты, в которые вложение не уходит (бот заблокирован). */
function fakeTelegram(failChats: string[] = []): FakeTelegram {
  const photoTo: string[] = [];
  const captions: { chatId: string; text: string }[] = [];
  const telegram = {
    callApi: (method: string, payload: { chat_id: string; text?: string }) => {
      if (method === 'sendMessage') {
        captions.push({ chatId: payload.chat_id, text: payload.text ?? '' });
      } else if (failChats.includes(payload.chat_id)) {
        return Promise.reject(new Error('бот заблокирован'));
      } else {
        photoTo.push(payload.chat_id);
      }
      return Promise.resolve(true);
    },
  } as unknown as Telegram;
  return { telegram, photoTo, captions };
}

const sendAttachment = (telegram: Telegram, chatId: string): Promise<unknown> =>
  telegram.callApi('sendPhoto', { chat_id: chatId, photo: 'file' });

describe('PaymentScreenshotToAccountant', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let prefsModel: Model<NotificationPrefsRecord>;
  let notificationModel: Model<NotificationRecord>;
  let toAccountant: PaymentScreenshotToAccountant;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    prefsModel = connection.model<NotificationPrefsRecord>(NotificationPrefsRecord.name);
    notificationModel = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    await notificationModel.syncIndexes();
    const usersService = new UsersService(userModel);
    toAccountant = new PaymentScreenshotToAccountant(
      new PersonalChats(
        usersService,
        channelModel,
        new NotificationPrefsService(prefsModel),
      ),
      usersService,
      notificationModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    warn.mockRestore();
    error.mockRestore();
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await prefsModel.deleteMany({});
    await notificationModel.deleteMany({});
  });

  async function connectPerson(
    telegramId: number,
    name: string,
    roles: UserRole[],
  ): Promise<string> {
    const user = await userModel.create({ name, telegramId, roles });
    await channelModel.create({
      type: 'telegram',
      title: `Личные сообщения: ${name}`,
      config: '{}',
      target: String(telegramId),
      active: true,
    });
    return user._id.toString();
  }

  /** Бухгалтер без бота — в ленте ему всё равно должна появиться строка. */
  async function accountantWithoutBot(name: string): Promise<string> {
    const user = await userModel.create({ name, roles: ['accountant'] });
    return user._id.toString();
  }

  function feedRows(userId: string) {
    return notificationModel.find({ userId, kind: 'payments' }).lean();
  }

  function loggedText(): string {
    return JSON.stringify(warn.mock.calls) + JSON.stringify(error.mock.calls);
  }

  it('шлёт каждому бухгалтеру из listFor: вложение, затем подпись с именем и месяцем', async () => {
    await connectPerson(111, 'Маша', ['accountant']);
    await connectPerson(222, 'Ольга', ['accountant']);
    await connectPerson(333, 'Пётр', ['teacher']); // payments не в его дефолте
    const fake = fakeTelegram();

    await toAccountant.deliver(fake.telegram, { ...BASE, sendAttachment });

    expect([...fake.photoTo].sort()).toEqual(['111', '222']);
    const caption = 'Скриншот от Ученик Иванов — оплата за сентябрь 2026.';
    expect(fake.captions.sort((a, b) => a.chatId.localeCompare(b.chatId))).toEqual([
      { chatId: '111', text: caption },
      { chatId: '222', text: caption },
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('замена — подпись «Новый скриншот … взамен прежнего»', async () => {
    await connectPerson(111, 'Маша', ['accountant']);
    const fake = fakeTelegram();

    await toAccountant.deliver(fake.telegram, {
      ...BASE,
      replaced: true,
      sendAttachment,
    });

    expect(fake.captions).toEqual([
      {
        chatId: '111',
        text: 'Новый скриншот от Ученик Иванов взамен прежнего — оплата за сентябрь 2026.',
      },
    ]);
  });

  it('некому отправить — warn с userId и месяцем полями и строка в ленте бухгалтера', async () => {
    const accountantId = await accountantWithoutBot('Маша');
    const fake = fakeTelegram();

    await toAccountant.deliver(fake.telegram, { ...BASE, sendAttachment });

    expect(fake.photoTo).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('некому отправить'), {
      userId: STUDENT_USER_ID,
      month: '2026-09',
    });
    expect(error).not.toHaveBeenCalled();
    const rows = await feedRows(accountantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ paymentMonth: '2026-09', readAt: null });
    expect(loggedText()).not.toContain(STUDENT_NAME);
  });

  // ADR-0156: выключенный вид — не повод потерять снимок, лента мимо переключателя.
  it('бухгалтер выключил payments — в Telegram не шлём, строка в ленте есть', async () => {
    const accountantId = await connectPerson(111, 'Маша', ['accountant']);
    await prefsModel.create({
      userId: accountantId,
      overrides: [{ kind: 'payments', enabled: false }],
    });
    const fake = fakeTelegram();

    await toAccountant.deliver(fake.telegram, { ...BASE, sendAttachment });

    expect(fake.photoTo).toEqual([]);
    await expect(feedRows(accountantId)).resolves.toHaveLength(1);
  });

  it('вложение не дошло НИКОМУ — error с userId и месяцем, строка в ленте, имени в логе нет', async () => {
    const accountantId = await connectPerson(111, 'Маша', ['accountant']);
    await connectPerson(222, 'Ольга', ['accountant']);
    const fake = fakeTelegram(['111', '222']);

    await toAccountant.deliver(fake.telegram, { ...BASE, sendAttachment });

    expect(fake.captions).toEqual([]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('не дошёл'), {
      userId: STUDENT_USER_ID,
      month: '2026-09',
    });
    await expect(feedRows(accountantId)).resolves.toHaveLength(1);
    expect(loggedText()).not.toContain(STUDENT_NAME);
  });

  it('один из двух адресатов не принял — без error и без ленты, второй получил', async () => {
    const failedId = await connectPerson(111, 'Маша', ['accountant']);
    const okId = await connectPerson(222, 'Ольга', ['accountant']);
    const fake = fakeTelegram(['111']);

    await toAccountant.deliver(fake.telegram, { ...BASE, sendAttachment });

    expect(fake.photoTo).toEqual(['222']);
    expect(fake.captions.map((c) => c.chatId)).toEqual(['222']);
    expect(error).not.toHaveBeenCalled();
    await expect(feedRows(failedId)).resolves.toEqual([]);
    await expect(feedRows(okId)).resolves.toEqual([]);
    // warn про одного отказавшего — чат полем, имя ученика не в логе.
    expect(loggedText()).not.toContain(STUDENT_NAME);
  });

  it('бота нет (telegram === null) — считается «не дошло никому»: error и лента', async () => {
    const accountantId = await connectPerson(111, 'Маша', ['accountant']);

    await toAccountant.deliver(null, { ...BASE, sendAttachment });

    expect(error).toHaveBeenCalledWith(expect.stringContaining('не дошёл'), {
      userId: STUDENT_USER_ID,
      month: '2026-09',
    });
    await expect(feedRows(accountantId)).resolves.toHaveLength(1);
  });

  it('повторная замена за тот же месяц — у бухгалтера одна строка ленты, снова непрочитанная', async () => {
    const accountantId = await accountantWithoutBot('Маша');
    await toAccountant.deliver(null, { ...BASE, sendAttachment });
    await notificationModel.updateOne(
      { userId: accountantId },
      { $set: { readAt: NOW.toJSDate() } },
    );

    await toAccountant.deliver(null, { ...BASE, replaced: true, sendAttachment });

    const rows = await feedRows(accountantId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt).toBeNull();
  });

  it('сбой базы внутри доставки не выбрасывается — только error со стеком', async () => {
    jest.spyOn(userModel, 'find').mockImplementationOnce(() => {
      throw new Error('база недоступна');
    });

    await expect(
      toAccountant.deliver(fakeTelegram().telegram, { ...BASE, sendAttachment }),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('база недоступна'),
      expect.any(String),
    );
  });
});
