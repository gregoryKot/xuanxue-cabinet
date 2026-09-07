// Против настоящей Mongo (mongodb-memory-server, не мок сервисов — CLAUDE.md
// «Тесты»): фейковый ctx (маршрутизацию Telegraf проверяет
// telegram-bot.service.spec.ts), только те поля, которые читает хендлер.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { BroadcastRecord, BroadcastSchema } from '../../broadcasts/broadcast.schema';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { DeliveryRecord, DeliverySchema } from '../../deliveries/delivery.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { TeacherChats } from '../teacher-chats';
import { CallbackQueryHandler } from './callback-query.handler';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

function fakeCtx(options: { chatId?: number; data?: string }): {
  ctx: Context;
  editCalls: string[];
} {
  const editCalls: string[] = [];
  const ctx = {
    chat: options.chatId === undefined ? undefined : { id: options.chatId },
    callbackQuery: options.data === undefined ? undefined : { data: options.data },
    answerCbQuery: () => Promise.resolve(true),
    editMessageText: (text: string) => {
      editCalls.push(text);
      return Promise.resolve(true);
    },
    reply: (text: string) => {
      editCalls.push(text);
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, editCalls };
}

describe('CallbackQueryHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let userModel: Model<UserRecord>;
  let botSessionModel: Model<BotSessionRecord>;
  let handler: CallbackQueryHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    botSessionModel = connection.model<BotSessionRecord>(
      BotSessionRecord.name,
      BotSessionSchema,
    );
    await botSessionModel.syncIndexes();
    const teacherChats = new TeacherChats(new UsersService(userModel), channelModel);
    handler = new CallbackQueryHandler(
      teacherChats,
      new BroadcastsService(broadcastModel, deliveryModel, channelModel),
      new BotSessionService(botSessionModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      broadcastModel.deleteMany({}),
      deliveryModel.deleteMany({}),
      channelModel.deleteMany({}),
      userModel.deleteMany({}),
      botSessionModel.deleteMany({}),
    ]);
  });

  async function seedTeacher(chatId: number): Promise<void> {
    await userModel.create({ name: 'Мария', telegramId: chatId, roles: ['teacher'] });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: String(chatId),
      active: true,
    });
  }

  it('cancel: — отменяет рассылку, редактирует сообщение', async () => {
    await seedTeacher(111);
    const broadcast = await broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual(['Отменено. Ссылка не уйдёт.']);
    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.status).toBe('cancelled');
  });

  it('cancel: рассылка уже отправлена — понятная ошибка, не общий текст', async () => {
    await seedTeacher(111);
    const broadcast = await broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'sent',
    });
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual(['Уже отправлено. Отменить нечего.']);
  });

  it('cancel: неожиданная ошибка сервиса — общий текст, не падает', async () => {
    await seedTeacher(111);
    const failingBroadcasts = {
      cancel: jest.fn().mockRejectedValue(new Error('mongo упал')),
    } as unknown as BroadcastsService;
    const failingHandler = new CallbackQueryHandler(
      new TeacherChats(new UsersService(userModel), channelModel),
      failingBroadcasts,
      new BotSessionService(botSessionModel),
    );
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await failingHandler.handle(ctx);

    expect(editCalls).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
  });

  it('неожиданная ошибка вне handleCancel/handleTopicButton — лог, общий ответ через reply', async () => {
    await seedTeacher(111);
    const failingSessions = {
      startTopicWait: jest.fn().mockRejectedValue(new Error('mongo упал')),
    } as unknown as BotSessionService;
    const failingHandler = new CallbackQueryHandler(
      new TeacherChats(new UsersService(userModel), channelModel),
      new BroadcastsService(broadcastModel, deliveryModel, channelModel),
      failingSessions,
    );
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `topic:${new Types.ObjectId().toString()}`,
    });

    await failingHandler.handle(ctx);

    expect(editCalls).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
  });

  it('topic: — заводит ожидание темы, просит написать одним сообщением', async () => {
    await seedTeacher(111);
    const lessonId = new Types.ObjectId();
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `topic:${lessonId.toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual(['Напишите тему одним сообщением.']);
    const session = await botSessionModel.findOne({ chatId: 111 }).lean();
    expect(session?.kind).toBe('topic');
    expect(session?.lessonId.toString()).toBe(lessonId.toString());
  });

  it('нет ctx.chat (chatId неизвестен) — тихо выходит', async () => {
    const { ctx, editCalls } = fakeCtx({
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual([]);
  });

  it('чат не совпадает ни с одним учителем (список непустой) — тихо игнорируется', async () => {
    await seedTeacher(111);
    const { ctx, editCalls } = fakeCtx({
      chatId: 222,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual([]);
  });

  it('чужой чат (не в TeacherChats) — тихо игнорируется, БД не трогает', async () => {
    const broadcast = await broadcastModel.create({
      kind: 'lesson_link',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    const { ctx, editCalls } = fakeCtx({
      chatId: 999,
      data: `cancel:${broadcast._id.toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual([]);
    const untouched = await broadcastModel.findById(broadcast._id).lean();
    expect(untouched?.status).toBe('scheduled');
  });

  it('невалидный id в data — игнорируется, не падает', async () => {
    await seedTeacher(111);
    const { ctx } = fakeCtx({ chatId: 111, data: 'cancel:не-id' });

    await expect(handler.handle(ctx)).resolves.toBeUndefined();
  });

  it('неизвестное действие — игнорируется', async () => {
    await seedTeacher(111);
    const { ctx, editCalls } = fakeCtx({
      chatId: 111,
      data: `unknown:${new Types.ObjectId().toString()}`,
    });

    await handler.handle(ctx);

    expect(editCalls).toEqual([]);
  });

  it('нет callback_query.data — тихо выходит', async () => {
    const { ctx } = fakeCtx({ chatId: 111 });
    await expect(handler.handle(ctx)).resolves.toBeUndefined();
  });

  it('answerCbQuery зовётся всегда, даже для чужого чата', async () => {
    const { ctx } = fakeCtx({
      chatId: 999,
      data: `cancel:${new Types.ObjectId().toString()}`,
    });
    const spy = jest.spyOn(ctx, 'answerCbQuery');

    await handler.handle(ctx);

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
