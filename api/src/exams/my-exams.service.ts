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
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import { ExamAttemptRecord } from './exam-attempt.schema';
import { decryptGrading, type RawLeanExamGrading } from './exam-grading.mapper';
import { ExamGradingRecord } from './exam-grading.schema';
import { EXAM_ENCRYPT_SCHEMA, ExamRecord } from './exam.schema';
import { decryptRecord } from '../utils/encryption';
import {
  toMyExamDto,
  type MyExamInput,
  type MyExamLastAttemptInput,
} from './my-exam.mapper';

// `Pick<ExamRecord, ...>` вместо простого пересечения — тот же приём, что у
// RawLeanExam (exam.mapper.ts): иначе тип не проходит ограничение
// `T extends Record<string, unknown>` у decryptRecord.
type RawLeanMyExam = Pick<
  ExamRecord,
  'title' | 'description' | 'level' | 'attemptsAllowed'
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

  /** Одним запросом на весь список форм (не N+1, тот же приём, что
   * `findLinkBroadcastStatusByLessonId` у /lessons): сколько попыток ученик
   * начал по каждой форме и что со свежей из них (наибольший `attemptNo`). */
  private async loadAttemptSummaries(
    examIds: string[],
    userId: string,
    now: DateTime,
  ): Promise<Map<string, AttemptSummary>> {
    if (examIds.length === 0) return new Map();
    // Сортировка по attemptNo убыванием на самой базе — первый попавшийся
    // документ на форму и есть последняя попытка; порядок не зависит от
    // «естественного» порядка Mongo (детерминизм, CLAUDE.md «Тесты»).
    const docs = await this.attemptModel
      .find({ examId: { $in: examIds }, userId })
      .sort({ attemptNo: -1 })
      .lean<RawLeanExamAttempt[]>();
    const latestByExamId = new Map<string, LeanExamAttempt>();
    const attemptsUsedByExamId = new Map<string, number>();
    for (const doc of docs) {
      const attempt = decryptAttempt(doc);
      const key = attempt.examId.toString();
      attemptsUsedByExamId.set(key, (attemptsUsedByExamId.get(key) ?? 0) + 1);
      if (!latestByExamId.has(key)) latestByExamId.set(key, attempt);
    }

    const gradingByAttemptId = await this.loadGradings(
      [...latestByExamId.values()].map((attempt) => attempt._id.toString()),
    );
    const result = new Map<string, AttemptSummary>();
    const notify = attemptSubmittedCallback(this.examNotifier, now);
    for (const [key, attempt] of latestByExamId) {
      // Дедлайн мог истечь — та же лениво-закрывающая проверка и
      // уведомление учителю, что у /attempts (ExamAttemptsService.list).
      const closed = await closeIfExpiredAttempt(this.attemptModel, attempt, now, notify);
      const grading = gradingByAttemptId.get(closed._id.toString());
      result.set(key, {
        attemptsUsed: attemptsUsedByExamId.get(key) ?? 0,
        lastAttempt: {
          id: closed._id.toString(),
          status: closed.status,
          outcome: grading?.outcome,
          comment: grading?.comment,
        },
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
