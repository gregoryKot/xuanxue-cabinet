// GET /me/exams (ТЗ docs/PLAN.md §11 слой 4.1 и 4.6) — опубликованные
// формы плюс положение самого ученика по каждой из них (`userId` — только
// из сессии, чужие попытки и чужие оценки сюда не попадают ни при каком
// запросе).
//
// Итог и комментарий учителя (слой 4.6, `exam_gradings`) — можно: это
// разбор собственной работы ученика (PLAN §11 «Границы»). Критерии
// проверки вопроса (`ExamItemDto.criteria`) сюда не попадают в принципе —
// этот сервис их не читает вовсе.
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  type ListMyExamsQuery,
  type MyExamDto,
} from '@xuanxue/shared';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import { attemptSubmittedCallback } from './notify-attempt-submitted';
import { decryptAttempt } from './exam-attempt.mapper';
import { aggregateAttemptSummaries } from './my-exam-attempt-summaries';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { decryptGrading, type RawLeanExamGrading } from './exam-grading.mapper';
import { ExamGradingRecord } from './exam-grading.schema';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord } from './exam.schema';
import { decryptRecord } from '../utils/encryption';
import {
  toMyExamDto,
  toMyExamLastAttemptInput,
  type MyExamInput,
  type MyExamLastAttemptInput,
} from './my-exam.mapper';

// `Pick<ExamRecord, ...>` вместо простого пересечения — тот же приём, что у
// RawLeanExam (exam.mapper.ts): иначе тип не проходит ограничение
// `T extends Record<string, unknown>` у decryptRecord.
type RawLeanMyExam = Pick<
  ExamRecord,
  'title' | 'description' | 'level' | 'attemptsAllowed' | 'timeLimitMin' | 'dueAt'
> & { _id: Types.ObjectId };

interface AttemptSummary {
  attemptsUsed: number;
  lastAttempt: MyExamLastAttemptInput;
}

@Injectable()
export class MyExamsService {
  constructor(
    @InjectModel(ExamRecord.name) private readonly examModel: Model<ExamRecord>,
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    @Inject(EXAM_NOTIFIER) private readonly examNotifier: ExamNotifier,
  ) {}

  async list(
    query: ListMyExamsQuery,
    userId: string,
    now: DateTime,
  ): Promise<MyExamDto[]> {
    const examDocs = await this.examModel
      .find({ status: 'published' })
      .sort({ updatedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanMyExam[]>();

    const summaryByExamId = await this.loadAttemptSummaries(
      examDocs.map((doc) => doc._id.toString()),
      userId,
      now,
    );

    return examDocs.map((doc) => {
      const exam: MyExamInput = decryptRecord(doc, EXAM_ENCRYPT_SCHEMA);
      const summary = summaryByExamId.get(doc._id.toString());
      return toMyExamDto(exam, summary?.attemptsUsed ?? 0, summary?.lastAttempt);
    });
  }

  /** Сколько попыток ученик начал по каждой форме и что со свежей из них
   * (наибольший `attemptNo`) — через агрегацию в базе, не вычитывая все
   * попытки (my-exam-attempt-summaries.ts, там же «почему»). Расшифровывает
   * только саму последнюю попытку на форму, не весь список. */
  private async loadAttemptSummaries(
    examIds: string[],
    userId: string,
    now: DateTime,
  ): Promise<Map<string, AttemptSummary>> {
    const aggregated = await aggregateAttemptSummaries({
      attemptModel: this.attemptModel,
      examIds,
      userId,
    });
    if (aggregated.size === 0) return new Map();

    const gradingByAttemptId = await this.loadGradings(
      [...aggregated.values()].map((summary) => summary.latest._id.toString()),
    );
    const result = new Map<string, AttemptSummary>();
    const notify = attemptSubmittedCallback(this.examNotifier, now);
    for (const [key, summary] of aggregated) {
      const attempt = decryptAttempt(summary.latest);
      // Дедлайн мог истечь — та же лениво-закрывающая проверка и
      // уведомление учителю, что у /attempts (ExamAttemptsService.list).
      const closed = await closeIfExpiredAttempt(this.attemptModel, attempt, now, notify);
      const grading = gradingByAttemptId.get(closed._id.toString());
      result.set(key, {
        attemptsUsed: summary.attemptsUsed,
        lastAttempt: toMyExamLastAttemptInput(closed, grading),
      });
    }
    return result;
  }

  /** Одним запросом на все последние попытки (не N+1, тот же приём, что
   * у попыток выше) — оценка, если она уже выставлена (слой 4.6). */
  private async loadGradings(
    attemptIds: string[],
  ): Promise<Map<string, RawLeanExamGrading>> {
    if (attemptIds.length === 0) return new Map();
    const docs = await this.gradingModel
      .find({ attemptId: { $in: attemptIds } })
      .lean<RawLeanExamGrading[]>();
    return new Map(docs.map((doc) => [doc.attemptId.toString(), decryptGrading(doc)]));
  }
}
