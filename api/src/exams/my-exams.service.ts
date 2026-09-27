// GET /me/exams (ТЗ docs/PLAN.md §11 слой 4.1 и 4.6) — опубликованные
// формы плюс положение самого ученика по каждой из них (`userId` — только
// из сессии, чужие попытки и чужие оценки сюда не попадают ни при каком
// запросе).
//
// Итог и комментарий учителя (слой 4.6, `exam_gradings`) — можно: это
// разбор собственной работы ученика (PLAN §11 «Границы»).
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  type ListMyExamsQuery,
  type MyExamDto,
} from '@xuanxue/shared';
import { NOT_DELETED } from '../common/soft-delete';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { assertExamPublished } from './exam-start-guards';
import { closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import { attemptSubmittedCallback } from './notify-attempt-submitted';
import { decryptAttempt } from './exam-attempt.mapper';
import { aggregateAttemptSummaries } from './my-exam-attempt-summaries';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { decryptGrading, type RawLeanExamGrading } from './exam-grading.mapper';
import { ExamGradingRecord } from './exam-grading.schema';
import { markExamSeen } from './exam-seen-mark.write';
import { ExamSeenMarkRecord } from './exam-seen-mark.schema';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord } from './exam.schema';
import { ExamsService } from './exams.service';
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
    @InjectModel(ExamSeenMarkRecord.name)
    private readonly seenMarkModel: Model<ExamSeenMarkRecord>,
    @Inject(EXAM_NOTIFIER) private readonly examNotifier: ExamNotifier,
    private readonly examsService: ExamsService,
  ) {}

  async list(
    query: ListMyExamsQuery,
    userId: string,
    now: DateTime,
  ): Promise<MyExamDto[]> {
    const examDocs = await this.examModel
      .find({ status: 'published', ...NOT_DELETED })
      .sort({ updatedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanMyExam[]>();
    const examIds = examDocs.map((doc) => doc._id.toString());

    const summaryByExamId = await this.loadAttemptSummaries(examIds, userId, now);
    const seenExamIds = await this.loadSeenExamIds(examIds, userId);

    return examDocs.map((doc) => {
      const exam: MyExamInput = decryptRecord(doc, EXAM_ENCRYPT_SCHEMA);
      const summary = summaryByExamId.get(doc._id.toString());
      const seen = seenExamIds.has(doc._id.toString());
      return toMyExamDto(exam, summary?.attemptsUsed ?? 0, summary?.lastAttempt, seen);
    });
  }

  /** Отзыв тестировщицы 2026-09-23 (ADR-0129): счётчик уведомлений гаснет,
   * как только ученик нажал на карточку задания, а не когда он реально начал
   * попытку — форма обязана быть опубликована и доступна ученику тем же
   * путём, что старт попытки (ExamAttemptsService.start): getById бросает
   * 404 на неизвестном/чужом/удалённом id, assertExamPublished — 400 на
   * черновике/архиве. Идемпотентно (upsert, exam-seen-mark.write.ts) —
   * второй клик или повтор на плохой связи не падает и не плодит вторую строку. */
  async markSeen(examId: string, userId: string): Promise<void> {
    const exam = await this.examsService.getById(examId);
    assertExamPublished(exam.status);
    await markExamSeen(this.seenMarkModel, userId, examId);
  }

  /** Какие из этих форм ученик уже открывал — одним запросом на всю
   * страницу (тот же приём, что loadGradings ниже: не N+1). */
  private async loadSeenExamIds(examIds: string[], userId: string): Promise<Set<string>> {
    if (examIds.length === 0) return new Set();
    const docs = await this.seenMarkModel
      .find({ userId, examId: { $in: examIds } })
      .lean<{ examId: string }[]>();
    return new Set(docs.map((doc) => doc.examId));
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
