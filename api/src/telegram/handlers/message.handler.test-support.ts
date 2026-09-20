// Подъём Mongo + сборка MessageHandler для трёх message.handler.*.spec.ts
// (спек-лимит 300 строк — CLAUDE.md «Файлы»). fakeCtx/messageOf —
// message.handler.fake-ctx.ts, seedTeacher/seedLesson — message.handler.seed.ts
// (файл-лимит 150 у каждого).
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { BroadcastModels } from '../../broadcasts/broadcast-models.provider';
import { RecordingBroadcastService } from '../../broadcasts/recording-broadcast.service';
import { BroadcastRecord, BroadcastSchema } from '../../broadcasts/broadcast.schema';
import { LessonLinkRebuildService } from '../../broadcasts/lesson-link-rebuild.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { DeliveryRecord, DeliverySchema } from '../../deliveries/delivery.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { LessonsService } from '../../lessons/lessons.service';
import { MaterialRecord, MaterialSchema } from '../../materials/material.schema';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import type { ExamMediaMessageHandler } from './exam-media-message.handler';
import type { ExamTextAnswerHandler } from './exam-text-answer.handler';
import type { GradeCommentHandler } from './grade-comment.handler';
import { MessageHandler } from './message.handler';
import type { NewExamMessageHandler } from './new-exam-message.handler';
import type { NewExamItemMessageHandler } from './new-exam-item-message.handler';
import { RecordingWaitHandler } from './recording-wait.handler';

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
  materialModel: Model<MaterialRecord>;
  handler: MessageHandler;
  // Тип object-фейка, не класса (тот же приём, что fakeHandler() у
  // TelegramBotService) — иначе `expect(examMediaHandler.handle)` в спеке
  // ловит eslint unbound-method: ссылка на метод класса без вызова.
  examMediaHandler: { handle: jest.Mock };
  examTextHandler: { handle: jest.Mock };
  newExamItemHandler: { handle: jest.Mock };
  newExamHandler: { handle: jest.Mock };
  gradeCommentHandler: { handle: jest.Mock };
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
  const materialModel = connection.model<MaterialRecord>(
    MaterialRecord.name,
    MaterialSchema,
  );
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
  const lessonLinkRebuild = new LessonLinkRebuildService(
    broadcastModels,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  const lessonsService = new LessonsService(
    lessonModel,
    classModel,
    recordingBroadcast,
    lessonLinkRebuild,
    broadcastModel,
    userModel,
    materialModel,
  );
  const recordingWaitHandler = new RecordingWaitHandler(
    new BotSessionService(botSessionModel),
    lessonsService,
    broadcastModel,
    classModel,
  );
  // Видео экзамена — своя ветка диспетчера; саму механику (привязка,
  // пересылка) проверяет exam-media-message.handler.spec.ts своими фейками,
  // здесь — фейк с проверяемым вызовом: message.handler.access.spec.ts
  // подтверждает, что MessageHandler зовёт именно его при kind: 'examMedia'.
  const examMediaHandler = { handle: jest.fn() };
  const examTextHandler = { handle: jest.fn() };
  const newExamItemHandler = { handle: jest.fn() };
  const newExamHandler = { handle: jest.fn() };
  const gradeCommentHandler = { handle: jest.fn() };
  const handler = new MessageHandler(
    buildPersonalChats(connection, usersService, channelModel),
    new BotSessionService(botSessionModel),
    lessonsService,
    lessonLinkRebuild,
    recordingWaitHandler,
    examMediaHandler as unknown as ExamMediaMessageHandler,
    examTextHandler as unknown as ExamTextAnswerHandler,
    newExamItemHandler as unknown as NewExamItemMessageHandler,
    newExamHandler as unknown as NewExamMessageHandler,
    gradeCommentHandler as unknown as GradeCommentHandler,
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
    materialModel,
    handler,
    examMediaHandler,
    examTextHandler,
    newExamItemHandler,
    newExamHandler,
    gradeCommentHandler,
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
    ctx.materialModel.deleteMany({}),
  ]);
}
