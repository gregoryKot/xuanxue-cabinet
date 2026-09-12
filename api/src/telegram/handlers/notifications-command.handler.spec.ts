// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// /уведомления — доступ (личный чат учителя/помощника/админа) и содержимое
// экрана по текущим настройкам.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { NotificationPrefsRecord } from '../../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { buildTeacherChats } from '../test-support/build-teacher-chats';
import { seedTeacher } from '../test-support/seed-teacher';
import { NotificationsCommandHandler } from './notifications-command.handler';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

function fakeCtx(
  chatId: number | undefined,
  chatType: 'private' | 'group' = 'private',
): { ctx: Context; replies: { text: string; buttons?: unknown }[] } {
  const replies: { text: string; buttons?: unknown }[] = [];
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
    reply: (text: string, extra?: { reply_markup?: { inline_keyboard: unknown } }) => {
      replies.push({ text, buttons: extra?.reply_markup?.inline_keyboard });
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('NotificationsCommandHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let handler: NotificationsCommandHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    const usersService = new UsersService(userModel);
    handler = new NotificationsCommandHandler(
      buildTeacherChats(connection, usersService, channelModel),
      usersService,
      new NotificationPrefsService(notificationPrefsModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      userModel.deleteMany({}),
      channelModel.deleteMany({}),
      notificationPrefsModel.deleteMany({}),
    ]);
  });

  it('учитель — список из трёх видов, все включены по умолчанию', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111);

    await handler.handle(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]?.text).toContain('Черновик поста — включено');
    expect(replies[0]?.text).toContain('Напоминание про запись — включено');
    expect(replies[0]?.text).toContain('Пост не ушёл — включено');
    expect(replies[0]?.buttons).toEqual([
      [{ text: 'Выключить: Черновик поста', callback_data: 'notif:post_draft' }],
      [
        {
          text: 'Выключить: Напоминание про запись',
          callback_data: 'notif:recording_request',
        },
      ],
      [{ text: 'Выключить: Пост не ушёл', callback_data: 'notif:delivery_failed' }],
    ]);
  });

  it('учёл ранее выключенный вид', async () => {
    const teacher = await userModel.create({
      name: 'Мария',
      telegramId: 111,
      roles: ['teacher'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '111',
      active: true,
    });
    await notificationPrefsModel.create({
      userId: teacher._id.toString(),
      overrides: [{ kind: 'delivery_failed', enabled: false }],
    });
    const { ctx, replies } = fakeCtx(111);

    await handler.handle(ctx, NOW);

    expect(replies[0]?.text).toContain('Пост не ушёл — выключено');
  });

  it('чужой чат (не в TeacherChats) — тихо игнорируется', async () => {
    const { ctx, replies } = fakeCtx(999);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('сообщение из группы — игнорируется', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('нет ctx.chat — тихо выходит, не падает', async () => {
    const { ctx, replies } = fakeCtx(undefined);

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });

  it('пользователь отвязан между проверкой доступа и резолвом (гонка) — тихо игнорируется', async () => {
    await seedTeacher(userModel, channelModel, 111);
    const missingUserService = {
      findByTelegramId: jest.fn().mockResolvedValue(null),
    } as unknown as UsersService;
    const racyHandler = new NotificationsCommandHandler(
      buildTeacherChats(connection, new UsersService(userModel), channelModel),
      missingUserService,
      new NotificationPrefsService(notificationPrefsModel),
    );
    const { ctx, replies } = fakeCtx(111);

    await expect(racyHandler.handle(ctx, NOW)).resolves.toBeUndefined();

    expect(replies).toEqual([]);
  });
});
