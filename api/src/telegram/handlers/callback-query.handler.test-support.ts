// Общая обвязка для callback-query.handler.spec.ts (действия кнопок) и
// callback-query.handler.access.spec.ts (доступ) — один файл был больше
// спек-лимита в 300 строк (CLAUDE.md «Файлы»), обвязка общая, чтобы не
// дублировать её (jscpd).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { BroadcastRecord } from '../../broadcasts/broadcast.schema';
import { ChannelRecord } from '../../channels/channel.schema';
import { DeliveryRecord } from '../../deliveries/delivery.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { TeacherChats } from '../teacher-chats';
import { CallbackQueryHandler } from './callback-query.handler';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export function fakeCtx(options: {
  chatId?: number;
  chatType?: 'private' | 'group';
  data?: string;
  noFrom?: boolean;
}): { ctx: Context; editCalls: string[] } {
  const editCalls: string[] = [];
  const ctx = {
    chat:
      options.chatId === undefined
        ? undefined
        : { id: options.chatId, type: options.chatType ?? 'private' },
    from:
      options.chatId === undefined || options.noFrom ? undefined : { id: options.chatId },
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

export interface CallbackHandlerTestContext {
  memory: MemoryMongo;
  connection: Connection;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  channelModel: Model<ChannelRecord>;
  userModel: Model<UserRecord>;
  botSessionModel: Model<BotSessionRecord>;
  handler: CallbackQueryHandler;
}

/** Свежий хендлер на тех же моделях, с необязательной подменой одного из
 * сервисов (тест сбоя `BroadcastsService.cancel`/`BotSessionService.startTopicWait`) —
 * TeacherChats при этом настоящий, доступ по-прежнему проверяется реально. */
export function buildHandler(
  ctx: CallbackHandlerTestContext,
  overrides: {
    broadcastsService?: BroadcastsService;
    botSessions?: BotSessionService;
  } = {},
): CallbackQueryHandler {
  return new CallbackQueryHandler(
    new TeacherChats(new UsersService(ctx.userModel), ctx.channelModel),
    overrides.broadcastsService ??
      new BroadcastsService(ctx.broadcastModel, ctx.deliveryModel, ctx.channelModel),
    overrides.botSessions ?? new BotSessionService(ctx.botSessionModel),
  );
}

export async function setupCallbackHandlerTest(): Promise<CallbackHandlerTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const broadcastModel = connection.model<BroadcastRecord>(BroadcastRecord.name);
  const deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name);
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name);
  const userModel = connection.model<UserRecord>(UserRecord.name);
  const botSessionModel = connection.model<BotSessionRecord>(BotSessionRecord.name);
  await botSessionModel.syncIndexes();
  const teacherChats = new TeacherChats(new UsersService(userModel), channelModel);
  const handler = new CallbackQueryHandler(
    teacherChats,
    new BroadcastsService(broadcastModel, deliveryModel, channelModel),
    new BotSessionService(botSessionModel),
  );
  return {
    memory,
    connection,
    broadcastModel,
    deliveryModel,
    channelModel,
    userModel,
    botSessionModel,
    handler,
  };
}

export async function clearCallbackHandlerTest(
  ctx: CallbackHandlerTestContext,
): Promise<void> {
  await Promise.all([
    ctx.broadcastModel.deleteMany({}),
    ctx.deliveryModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.userModel.deleteMany({}),
    ctx.botSessionModel.deleteMany({}),
  ]);
}

export async function seedTeacher(
  userModel: Model<UserRecord>,
  channelModel: Model<ChannelRecord>,
  chatId: number,
): Promise<void> {
  await userModel.create({ name: 'Мария', telegramId: chatId, roles: ['teacher'] });
  await channelModel.create({
    type: 'telegram',
    title: 'x',
    config: '{}',
    target: String(chatId),
    active: true,
  });
}
