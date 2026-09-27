// Общий подъём ExamAttemptsService против настоящей Mongo — делят
// exam-attempts.service.spec.ts и exam-attempts.time.spec.ts (файл-лимит
// спеков, тот же приём, что у telegram-teacher-notifier.test-support.ts,
// CLAUDE.md «Файлы»/«Храповики», jscpd). Сборка сервисов поверх моделей —
// exam-attempts-services.test-support.ts (тот же файл-лимит).
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import {
  NotificationPrefsRecord,
  NotificationPrefsSchema,
} from '../notifications/notification-prefs.schema';
import {
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import { UserRecord, UserSchema } from '../users/user.schema';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import {
  buildAttemptsServices,
  type AttemptsTestModels,
  type AttemptsTestServices,
} from './exam-attempts-services.test-support';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamSeenMarkRecord, ExamSeenMarkSchema } from './exam-seen-mark.schema';
import { ExamRecord, ExamSchema } from './exam.schema';

export const AUTHOR_ID = '507f1f77bcf86cd799439011';
export const USER_A = '507f1f77bcf86cd799439012';
export const USER_B = '507f1f77bcf86cd799439013';
export const GRADER_ID = '507f1f77bcf86cd799439014';

export interface AttemptsTestContext extends AttemptsTestServices, AttemptsTestModels {
  memory: MemoryMongo;
  // ADR-0129 — отметка «ученик открыл задание»; MyExamsService.spec.ts тоже
  // поднимает контекст отсюда, второй раз модель не заводит.
  seenMarkModel: Model<ExamSeenMarkRecord>;
}

export async function setupAttemptsTest(): Promise<AttemptsTestContext> {
  const memory = await openMemoryMongo();
  const connection: Connection = memory.connection;
  const attemptModel = connection.model<ExamAttemptRecord>(
    ExamAttemptRecord.name,
    ExamAttemptSchema,
  );
  const examModel = connection.model<ExamRecord>(ExamRecord.name, ExamSchema);
  const itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
  const gradingModel = connection.model<ExamGradingRecord>(
    ExamGradingRecord.name,
    ExamGradingSchema,
  );
  const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  const mediaModel = connection.model<MediaAssetRecord>(
    MediaAssetRecord.name,
    MediaAssetSchema,
  );
  const imageModel = connection.model<ExamImageRecord>(
    ExamImageRecord.name,
    ExamImageSchema,
  );
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const notificationPrefsModel = connection.model<NotificationPrefsRecord>(
    NotificationPrefsRecord.name,
    NotificationPrefsSchema,
  );
  const notificationModel = connection.model<NotificationRecord>(
    NotificationRecord.name,
    NotificationSchema,
  );
  const seenMarkModel = connection.model<ExamSeenMarkRecord>(
    ExamSeenMarkRecord.name,
    ExamSeenMarkSchema,
  );
  const services = buildAttemptsServices({
    attemptModel,
    examModel,
    itemModel,
    gradingModel,
    userModel,
    mediaModel,
    imageModel,
    channelModel,
    notificationPrefsModel,
    notificationModel,
  });
  return {
    memory,
    attemptModel,
    examModel,
    itemModel,
    gradingModel,
    userModel,
    mediaModel,
    imageModel,
    channelModel,
    notificationPrefsModel,
    notificationModel,
    seenMarkModel,
    ...services,
  };
}

export async function clearAttemptsTest(ctx: AttemptsTestContext): Promise<void> {
  await ctx.attemptModel.deleteMany({});
  await ctx.examModel.deleteMany({});
  await ctx.itemModel.deleteMany({});
  await ctx.gradingModel.deleteMany({});
  await ctx.userModel.deleteMany({});
  await ctx.imageModel.deleteMany({});
  await ctx.mediaModel.deleteMany({});
  await ctx.channelModel.deleteMany({});
  await ctx.notificationPrefsModel.deleteMany({});
  await ctx.notificationModel.deleteMany({});
  await ctx.seenMarkModel.deleteMany({});
  // Иначе вызовы ExamNotifier из одного теста утекают в счётчик следующего —
  // общий ctx на файл (afterEach), не свой инстанс на тест.
  ctx.examNotifier.notifyAttemptSubmitted.mockClear();
  ctx.examNotifier.notifyExamGraded.mockClear();
}
