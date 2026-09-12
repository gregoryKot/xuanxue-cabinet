// Общий подъём ExamAttemptsService против настоящей Mongo — делят
// exam-attempts.service.spec.ts и exam-attempts.time.spec.ts (файл-лимит
// спеков, тот же приём, что у telegram-teacher-notifier.test-support.ts,
// CLAUDE.md «Файлы»/«Храповики», jscpd).
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';

export const AUTHOR_ID = '507f1f77bcf86cd799439011';
export const USER_A = '507f1f77bcf86cd799439012';
export const USER_B = '507f1f77bcf86cd799439013';

export interface AttemptsTestContext {
  memory: MemoryMongo;
  attemptModel: Model<ExamAttemptRecord>;
  examModel: Model<ExamRecord>;
  itemModel: Model<ExamItemRecord>;
  examsService: ExamsService;
  examItemsService: ExamItemsService;
  service: ExamAttemptsService;
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
  const examsService = new ExamsService(examModel, itemModel);
  const examItemsService = new ExamItemsService(itemModel);
  const service = new ExamAttemptsService(attemptModel, examsService, examItemsService);
  return {
    memory,
    attemptModel,
    examModel,
    itemModel,
    examsService,
    examItemsService,
    service,
  };
}

export async function clearAttemptsTest(ctx: AttemptsTestContext): Promise<void> {
  await ctx.attemptModel.deleteMany({});
  await ctx.examModel.deleteMany({});
  await ctx.itemModel.deleteMany({});
}
