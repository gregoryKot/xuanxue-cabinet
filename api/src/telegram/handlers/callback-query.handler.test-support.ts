// Общая обвязка для callback-query.handler.*.spec.ts (cancel/topic, доступ,
// norec/sent, уведомления, меню): одним файлом спеки не влезали в лимит 300
// строк, а обвязка у них одна (jscpd).
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
import { buildMenuHandler } from '../test-support/build-menu-handler';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import { seedTeacher } from '../test-support/seed-teacher';
import { CallbackQueryHandler } from './callback-query.handler';

export { seedTeacher };

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export function fakeCtx(options: {
  chatId?: number;
  chatType?: 'private' | 'group';
  data?: string;
  noFrom?: boolean;
  /** Правку сообщения отклонили (его удалили, бота выкинули). */
  failEdit?: boolean;
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
    editMessageText: (text: string) =>
      options.failEdit
        ? Promise.reject(new Error('сообщение недоступно'))
        : Promise.resolve(Boolean(editCalls.push(text))),
    reply: (text: string) => Promise.resolve(Boolean(editCalls.push(text))),
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
 * PersonalChats/NotificationPrefsService при этом настоящие, доступ и
 * настройка по-прежнему проверяются реально. */
export function buildHandler(
  ctx: CallbackHandlerTestContext,
  overrides: {
    broadcastsService?: BroadcastsService;
    botSessions?: BotSessionService;
    deliveriesService?: DeliveriesService;
    // Только для гонки «чат отвязан между проверкой доступа и резолвом
    // userId»: сам доступ идёт через buildPersonalChats.
    usersService?: UsersService;
  } = {},
): CallbackQueryHandler {
  const usersService = new UsersService(ctx.userModel);
  return new CallbackQueryHandler(
    buildPersonalChats(ctx.connection, usersService, ctx.channelModel),
    overrides.broadcastsService ??
      new BroadcastsService(ctx.broadcastModel, ctx.deliveryModel, ctx.channelModel),
    overrides.botSessions ?? new BotSessionService(ctx.botSessionModel),
    overrides.deliveriesService ??
      new DeliveriesService(ctx.deliveryModel, ctx.broadcastModel, ctx.channelModel),
    overrides.usersService ?? usersService,
    new NotificationPrefsService(ctx.notificationPrefsModel),
    buildMenuHandler(ctx.connection, usersService, ctx.channelModel),
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
    buildPersonalChats(connection, usersService, channelModel),
    new BroadcastsService(broadcastModel, deliveryModel, channelModel),
    new BotSessionService(botSessionModel),
    new DeliveriesService(deliveryModel, broadcastModel, channelModel),
    usersService,
    new NotificationPrefsService(notificationPrefsModel),
    buildMenuHandler(connection, usersService, channelModel),
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
