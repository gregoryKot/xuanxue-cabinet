// Общий подъём ExamAttemptsService против настоящей Mongo — делят
// exam-attempts.service.spec.ts и exam-attempts.time.spec.ts (файл-лимит
// спеков, тот же приём, что у telegram-teacher-notifier.test-support.ts,
// CLAUDE.md «Файлы»/«Храповики», jscpd).
import type { Connection, Model } from 'mongoose';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { ExamVideoDeliveryRegistry } from '../media/exam-video-delivery.registry';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import { MediaAssetsService } from '../media/media-assets.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { fakeExamNotifier, type FakeExamNotifier } from './exam-notifier.test-support';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { ExamGradingsService } from './exam-gradings.service';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';

export const AUTHOR_ID = '507f1f77bcf86cd799439011';
export const USER_A = '507f1f77bcf86cd799439012';
export const USER_B = '507f1f77bcf86cd799439013';
export const GRADER_ID = '507f1f77bcf86cd799439014';

export interface AttemptsTestContext {
  memory: MemoryMongo;
  attemptModel: Model<ExamAttemptRecord>;
  examModel: Model<ExamRecord>;
  itemModel: Model<ExamItemRecord>;
  gradingModel: Model<ExamGradingRecord>;
  userModel: Model<UserRecord>;
  mediaModel: Model<MediaAssetRecord>;
  // Слой 4.2 (ADR-0035) — ExamItemsService проверяет через него существование
  // картинки варианта; спекам, которым нужна картинка в снимке попытки, тоже
  // не поднимать модель второй раз.
  imageModel: Model<ExamImageRecord>;
  examsService: ExamsService;
  examItemsService: ExamItemsService;
  examImagesService: ExamImagesService;
  userNamesService: UserNamesService;
  examNotifier: FakeExamNotifier;
  service: ExamAttemptsService;
  gradingsService: ExamGradingsService;
  // Слой 4.5 (ADR-0023) — нужен спекам про видео вопроса внутри потока
  // вопросов бота (exam-attempt-flow.spec.ts, ТЗ 4б.2 часть 2).
  mediaAssetsService: MediaAssetsService;
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
  const examsService = new ExamsService(examModel, itemModel, attemptModel);
  const examImagesService = new ExamImagesService(imageModel, attemptModel);
  const examItemsService = new ExamItemsService(itemModel, examModel, examImagesService);
  const userNamesService = new UserNamesService(userModel);
  const examNotifier = fakeExamNotifier();
  const service = new ExamAttemptsService(
    attemptModel,
    gradingModel,
    examsService,
    examItemsService,
    userNamesService,
    examNotifier,
  );
  const gradingsService = new ExamGradingsService(
    attemptModel,
    gradingModel,
    userNamesService,
    examNotifier,
  );
  // Реестр нотификатора ссылок (ADR-0084) — не собран в этих спеках
  // (ExamsModule здесь не поднимается): getOrNull() вернёт null, addLink()
  // это переживает молча (ExamMediaNotifierRegistry, комментарий там же).
  const mediaAssetsService = new MediaAssetsService(
    mediaModel,
    attemptModel,
    new UsersService(userModel),
    new ExamMediaNotifierRegistry(),
    new ExamVideoDeliveryRegistry(),
  );
  return {
    memory,
    attemptModel,
    examModel,
    itemModel,
    gradingModel,
    userModel,
    mediaModel,
    imageModel,
    examsService,
    examItemsService,
    examImagesService,
    userNamesService,
    examNotifier,
    service,
    gradingsService,
    mediaAssetsService,
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
  // Иначе вызовы ExamNotifier из одного теста утекают в счётчик следующего —
  // общий ctx на файл (afterEach), не свой инстанс на тест.
  ctx.examNotifier.notifyAttemptSubmitted.mockClear();
  ctx.examNotifier.notifyExamGraded.mockClear();
}
