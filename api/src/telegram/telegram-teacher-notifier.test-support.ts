// Общая обвязка для telegram-teacher-notifier.spec.ts (notifyDeliveryFailed) и
// telegram-teacher-notifier.scheduler.spec.ts (notifySchedulerFailed) — один
// файл был больше спек-лимита в 300 строк (CLAUDE.md «Файлы»), обвязка общая,
// чтобы не дублировать её (jscpd).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import type { TeacherChat } from './teacher-chats';
import type { TelegramBotService } from './telegram-bot.service';
import { TelegramTeacherNotifier } from './telegram-teacher-notifier';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CHAT: TeacherChat = { chatId: '111', userId: 'u1', name: 'Мария' };

export function fakeTeacherChats(chats: TeacherChat[] = [CHAT]): {
  list: jest.Mock<Promise<TeacherChat[]>, [DateTime]>;
} {
  return { list: jest.fn<Promise<TeacherChat[]>, [DateTime]>().mockResolvedValue(chats) };
}

export function fakeBot(): {
  sendMessage: jest.Mock<Promise<void>, [string, string, unknown[][]?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<void>, [string, string, unknown[][]?]>()
      .mockResolvedValue(undefined),
  };
}

export interface NotifierTestContext {
  memory: MemoryMongo;
  connection: Connection;
  broadcastModel: Model<BroadcastRecord>;
  channelModel: Model<ChannelRecord>;
  lessonModel: Model<LessonRecord>;
  classModel: Model<ClassRecord>;
}

export async function setupNotifierTest(): Promise<NotifierTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  return {
    memory,
    connection,
    broadcastModel: connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    ),
    channelModel: connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema),
    lessonModel: connection.model<LessonRecord>(LessonRecord.name, LessonSchema),
    classModel: connection.model<ClassRecord>(ClassRecord.name, ClassSchema),
  };
}

export async function clearNotifierTest(ctx: NotifierTestContext): Promise<void> {
  await Promise.all([
    ctx.broadcastModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.lessonModel.deleteMany({}),
    ctx.classModel.deleteMany({}),
  ]);
}

export function buildNotifier(
  ctx: NotifierTestContext,
  teacherChats = fakeTeacherChats(),
  bot = fakeBot(),
): {
  notifier: TelegramTeacherNotifier;
  teacherChats: ReturnType<typeof fakeTeacherChats>;
  bot: ReturnType<typeof fakeBot>;
} {
  const notifier = new TelegramTeacherNotifier(
    teacherChats as never,
    bot as unknown as TelegramBotService,
    ctx.broadcastModel,
    ctx.channelModel,
    ctx.lessonModel,
    ctx.classModel,
  );
  return { notifier, teacherChats, bot };
}
