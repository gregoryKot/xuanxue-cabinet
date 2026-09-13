// Подъём Mongo + сборка MessageHandler для трёх message.handler.*.spec.ts
// (спек-лимит 300 строк — CLAUDE.md «Файлы»). fakeCtx/messageOf —
// message.handler.fake-ctx.ts, seedTeacher/seedLesson — message.handler.seed.ts
// (файл-лимит 150 у каждого).
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { BroadcastModels } from '../../broadcasts/broadcast-models.provider';
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
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import { MessageHandler } from './message.handler';

export interface MessageHandlerTestContext {
  memory: MemoryMongo;
  connection: Connection;
  userModel: Model<UserRecord>;
  lessonModel: Model<LessonRecord>;
  classModel: Model<ClassRecord>;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  channelModel: Model<ChannelRecord>;
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
  const broadcastModels = new BroadcastModels(
    lessonModel,
    classModel,
    channelModel,
    broadcastModel,
    deliveryModel,
  );
  const recordingBroadcast = new RecordingBroadcastService(
    broadcastModels,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  const lessonsService = new LessonsService(
    lessonModel,
    classModel,
    recordingBroadcast,
    broadcastModel,
    userModel,
  );
  const topicRebuild = new TopicRebuildService(
    broadcastModel,
    lessonModel,
    classModel,
    deliveryModel,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  const handler = new MessageHandler(
    buildPersonalChats(connection, usersService, channelModel),
    new BotSessionService(botSessionModel),
    lessonsService,
    topicRebuild,
    broadcastModel,
    classModel,
  );
  return {
    memory,
    connection,
    userModel,
    lessonModel,
    classModel,
    broadcastModel,
    deliveryModel,
    channelModel,
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
    ctx.deliveryModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.botSessionModel.deleteMany({}),
  ]);
}
