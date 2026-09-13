// Общий подъём ExamAttemptsService против настоящей Mongo — делят
// exam-attempts.service.spec.ts и exam-attempts.time.spec.ts (файл-лимит
// спеков, тот же приём, что у telegram-teacher-notifier.test-support.ts,
// CLAUDE.md «Файлы»/«Храповики», jscpd).
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
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
  examsService: ExamsService;
  examItemsService: ExamItemsService;
  userNamesService: UserNamesService;
  service: ExamAttemptsService;
  gradingsService: ExamGradingsService;
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
  const examsService = new ExamsService(examModel, itemModel);
  const examItemsService = new ExamItemsService(itemModel);
  const userNamesService = new UserNamesService(userModel);
  const service = new ExamAttemptsService(
    attemptModel,
    examsService,
    examItemsService,
    userNamesService,
  );
  const gradingsService = new ExamGradingsService(
    attemptModel,
    gradingModel,
    examsService,
    userNamesService,
  );
  return {
    memory,
    attemptModel,
    examModel,
    itemModel,
    gradingModel,
    userModel,
    examsService,
    examItemsService,
    userNamesService,
    service,
    gradingsService,
  };
}

export async function clearAttemptsTest(ctx: AttemptsTestContext): Promise<void> {
  await ctx.attemptModel.deleteMany({});
  await ctx.examModel.deleteMany({});
  await ctx.itemModel.deleteMany({});
  await ctx.gradingModel.deleteMany({});
  await ctx.userModel.deleteMany({});
}
