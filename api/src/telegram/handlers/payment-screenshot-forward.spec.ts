// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): кто
// получает пересланный скриншот — дело того же PersonalChats.listFor, что и
// forwardExamVideoToTeachers (тот же приём, exam-media-forward.spec.ts).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { NotificationPrefsRecord } from '../../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { PersonalChats } from '../personal-chats';
import { forwardPaymentScreenshotToAccountant } from './payment-screenshot-forward';

const NOW = DateTime.fromISO('2026-09-15T09:00:00Z', { zone: 'utc' });
const STUDENT_USER_ID = '507f1f77bcf86cd799439011';

function fakeCtx(): {
  ctx: Context;
  sentMessages: { chatId: string; text: string }[];
  copiedTo: string[];
} {
  const sentMessages: { chatId: string; text: string }[] = [];
  const copiedTo: string[] = [];
  const ctx = {
    chat: { id: 111, type: 'private' },
    message: {
      message_id: 42,
      photo: [{ file_id: 'p1', file_unique_id: 'pu1' }],
    },
    telegram: {
      sendMessage: (toChatId: string, text: string) => {
        sentMessages.push({ chatId: toChatId, text });
        return Promise.resolve();
      },
      copyMessage: (toChatId: string) => {
        copiedTo.push(toChatId);
        return Promise.resolve();
      },
    },
  } as unknown as Context;
  return { ctx, sentMessages, copiedTo };
}

describe('forwardPaymentScreenshotToAccountant', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let personalChats: PersonalChats;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    personalChats = new PersonalChats(
      new UsersService(userModel),
      channelModel,
      new NotificationPrefsService(notificationPrefsModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
  });

  async function connectPerson(telegramId: number, name: string, roles: UserRole[]) {
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

  it('бухгалтер подключил бота — получает фото и подпись с месяцем', async () => {
    await connectPerson(111, 'Маша', ['accountant']);
    const { ctx, sentMessages, copiedTo } = fakeCtx();

    await forwardPaymentScreenshotToAccountant(
      ctx,
      personalChats,
      'Ученик',
      STUDENT_USER_ID,
      '2026-09',
      NOW,
    );

    expect(copiedTo).toEqual(['111']);
    expect(sentMessages).toEqual([
      { chatId: '111', text: 'Скриншот от Ученик — оплата за сентябрь 2026.' },
    ]);
  });

  it('учитель не получает скриншот (payments не в его дефолте роли)', async () => {
    await connectPerson(222, 'Пётр', ['teacher']);
    const { ctx, copiedTo } = fakeCtx();

    await forwardPaymentScreenshotToAccountant(
      ctx,
      personalChats,
      'Ученик',
      STUDENT_USER_ID,
      '2026-09',
      NOW,
    );

    expect(copiedTo).toEqual([]);
  });

  it('бухгалтер выключил payments — не получает, но не падаем', async () => {
    const accountantId = await connectPerson(333, 'Маша', ['accountant']);
    await notificationPrefsModel.create({
      userId: accountantId,
      overrides: [{ kind: 'payments', enabled: false }],
    });
    const { ctx, copiedTo } = fakeCtx();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      forwardPaymentScreenshotToAccountant(
        ctx,
        personalChats,
        'Ученик',
        STUDENT_USER_ID,
        '2026-09',
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(copiedTo).toEqual([]);
    warn.mockRestore();
  });

  it('никто не подключил бота — warn с userId и месяцем, без ПДн, не падает', async () => {
    const { ctx, sentMessages, copiedTo } = fakeCtx();
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      forwardPaymentScreenshotToAccountant(
        ctx,
        personalChats,
        'Ученик',
        STUDENT_USER_ID,
        '2026-09',
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(sentMessages).toEqual([]);
    expect(copiedTo).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'telegram.paymentScreenshot.forward: некому переслать',
      { userId: STUDENT_USER_ID, month: '2026-09' },
    );
    warn.mockRestore();
  });
});
