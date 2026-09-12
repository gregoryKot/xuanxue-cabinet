// Общая обвязка для callback-query.handler.spec.ts (cancel/topic),
// callback-query.handler.access.spec.ts (доступ) и
// callback-query.handler.norec-sent.spec.ts (norec/sent) — один файл был
// больше спек-лимита в 300 строк (CLAUDE.md «Файлы»), обвязка общая, чтобы не
// дублировать её (jscpd).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { BroadcastsService } from '../../broadcasts/broadcasts.service';
import { BroadcastRecord, BroadcastSchema } from '../../broadcasts/broadcast.schema';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { DeliveriesService } from '../../deliveries/deliveries.service';
import { DeliveryRecord, DeliverySchema } from '../../deliveries/delivery.schema';
import { NotificationPrefsRecord } from '../../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { buildTeacherChats } from '../test-support/build-teacher-chats';
import { seedTeacher } from '../test-support/seed-teacher';
import { CallbackQueryHandler } from './callback-query.handler';

export { seedTeacher };

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
  notificationPrefsModel: Model<NotificationPrefsRecord>;
  handler: CallbackQueryHandler;
}

/** Свежий хендлер на тех же моделях, с необязательной подменой одного из
 * сервисов (тест сбоя `BroadcastsService.cancel`/`BotSessionService.startTopicWait`) —
 * TeacherChats/NotificationPrefsService при этом настоящие, доступ и
 * настройка по-прежнему проверяются реально. */
export function buildHandler(
  ctx: CallbackHandlerTestContext,
  overrides: {
    broadcastsService?: BroadcastsService;
    botSessions?: BotSessionService;
    deliveriesService?: DeliveriesService;
    // Только для handleNotificationToggle (гонка «чат отвязан между проверкой
    // доступа и резолвом userId») — identity-проверка идёт через
    // buildTeacherChats на настоящем UsersService, не через эту подмену.
    usersService?: UsersService;
  } = {},
): CallbackQueryHandler {
  const usersService = new UsersService(ctx.userModel);
  return new CallbackQueryHandler(
    buildTeacherChats(ctx.connection, usersService, ctx.channelModel),
    overrides.broadcastsService ??
      new BroadcastsService(ctx.broadcastModel, ctx.deliveryModel, ctx.channelModel),
    overrides.botSessions ?? new BotSessionService(ctx.botSessionModel),
    overrides.deliveriesService ??
      new DeliveriesService(ctx.deliveryModel, ctx.broadcastModel, ctx.channelModel),
    overrides.usersService ?? usersService,
    new NotificationPrefsService(ctx.notificationPrefsModel),
  );
}

export async function setupCallbackHandlerTest(): Promise<CallbackHandlerTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const broadcastModel = connection.model<BroadcastRecord>(
    BroadcastRecord.name,
    BroadcastSchema,
  );
  const deliveryModel = connection.model<DeliveryRecord>(
    DeliveryRecord.name,
    DeliverySchema,
  );
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  const botSessionModel = connection.model<BotSessionRecord>(
    BotSessionRecord.name,
    BotSessionSchema,
  );
  const notificationPrefsModel = connection.model<NotificationPrefsRecord>(
    NotificationPrefsRecord.name,
  );
  await botSessionModel.syncIndexes();
  const usersService = new UsersService(userModel);
  const handler = new CallbackQueryHandler(
    buildTeacherChats(connection, usersService, channelModel),
    new BroadcastsService(broadcastModel, deliveryModel, channelModel),
    new BotSessionService(botSessionModel),
    new DeliveriesService(deliveryModel, broadcastModel, channelModel),
    usersService,
    new NotificationPrefsService(notificationPrefsModel),
  );
  return {
    memory,
    connection,
    broadcastModel,
    deliveryModel,
    channelModel,
    userModel,
    botSessionModel,
    notificationPrefsModel,
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
    ctx.notificationPrefsModel.deleteMany({}),
  ]);
}
