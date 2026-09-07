// Общая обвязка для message.handler.spec.ts и message.handler.access.spec.ts —
// один файл был больше спек-лимита в 300 строк (CLAUDE.md «Файлы»), тесты
// разделены по смыслу (поток темы vs доступ), обвязка — общая, чтобы не
// дублировать её (jscpd).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import {
  CLASS_ENCRYPT_SCHEMA,
  ClassRecord,
  ClassSchema,
} from '../../classes/class.schema';
import { RecordingBroadcastService } from '../../broadcasts/recording-broadcast.service';
import { BroadcastRecord, BroadcastSchema } from '../../broadcasts/broadcast.schema';
import { TopicRebuildService } from '../../broadcasts/topic-rebuild.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { DeliveryRecord, DeliverySchema } from '../../deliveries/delivery.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { LessonsService } from '../../lessons/lessons.service';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { encryptRecord } from '../../utils/encryption';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { MessageHandler } from './message.handler';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export function fakeCtx(options: {
  chatId?: number;
  chatType?: 'private' | 'group';
  text?: string;
  noFrom?: boolean;
}): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    chat:
      options.chatId === undefined
        ? undefined
        : { id: options.chatId, type: options.chatType ?? 'private' },
    from:
      options.chatId === undefined || options.noFrom ? undefined : { id: options.chatId },
    message: options.text === undefined ? undefined : { text: options.text },
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, replies };
}

export interface MessageHandlerTestContext {
  memory: MemoryMongo;
  connection: Connection;
  userModel: Model<UserRecord>;
  lessonModel: Model<LessonRecord>;
  classModel: Model<ClassRecord>;
  broadcastModel: Model<BroadcastRecord>;
  botSessionModel: Model<BotSessionRecord>;
  settingsModel: Model<SettingsRecord>;
  handler: MessageHandler;
}

export async function setupMessageHandlerTest(): Promise<MessageHandlerTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
  const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
  const broadcastModel = connection.model<BroadcastRecord>(
    BroadcastRecord.name,
    BroadcastSchema,
  );
  const deliveryModel = connection.model<DeliveryRecord>(
    DeliveryRecord.name,
    DeliverySchema,
  );
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const settingsModel = connection.model<SettingsRecord>(
    SettingsRecord.name,
    SettingsSchema,
  );
  const botSessionModel = connection.model<BotSessionRecord>(
    BotSessionRecord.name,
    BotSessionSchema,
  );
  await botSessionModel.syncIndexes();
  const usersService = new UsersService(userModel);
  const recordingBroadcast = new RecordingBroadcastService(
    lessonModel,
    classModel,
    channelModel,
    broadcastModel,
    deliveryModel,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  const lessonsService = new LessonsService(lessonModel, classModel, recordingBroadcast);
  const topicRebuild = new TopicRebuildService(
    broadcastModel,
    lessonModel,
    classModel,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  const handler = new MessageHandler(
    usersService,
    new BotSessionService(botSessionModel),
    lessonsService,
    topicRebuild,
  );
  return {
    memory,
    connection,
    userModel,
    lessonModel,
    classModel,
    broadcastModel,
    botSessionModel,
    settingsModel,
    handler,
  };
}

export async function clearMessageHandlerTest(
  ctx: MessageHandlerTestContext,
): Promise<void> {
  await Promise.all([
    ctx.userModel.deleteMany({}),
    ctx.lessonModel.deleteMany({}),
    ctx.classModel.deleteMany({}),
    ctx.broadcastModel.deleteMany({}),
    ctx.botSessionModel.deleteMany({}),
  ]);
}

export async function seedTeacher(
  userModel: Model<UserRecord>,
  chatId: number,
): Promise<void> {
  await userModel.create({ name: 'Мария', telegramId: chatId, roles: ['teacher'] });
}

export async function seedLesson(
  classModel: Model<ClassRecord>,
  lessonModel: Model<LessonRecord>,
) {
  const cls = await classModel.create(
    encryptRecord(
      {
        title: 'цигун для глаз',
        groupLabel: '',
        format: 'online',
        zoomLink: 'https://zoom.example/1',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        channelIds: [],
      },
      CLASS_ENCRYPT_SCHEMA,
    ),
  );
  return lessonModel.create({
    classId: cls._id,
    startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
    durationMin: 60,
    topic: 'старая тема',
    status: 'scheduled',
  });
}
