// GET /me/exams (ТЗ student-api.md, PLAN §11 слой 4.1) — опубликованные
// формы плюс положение самого ученика по каждой из них (`userId` — только
// из сессии, чужие попытки сюда не попадают ни при каком запросе).
//
// `result` в ответе намеренно нет — см. комментарий у MyExamDto (shared/src/
// exams.ts): рубрика и оценка (`exam_gradings`, слой 4.6) ещё не существуют.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  type ListMyExamsQuery,
  type MyExamDto,
} from '@xuanxue/shared';
import { closeIfExpiredAttempt } from './exam-attempt-lifecycle';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import { ExamAttemptRecord } from './exam-attempt.schema';
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

    const result = new Map<string, AttemptSummary>();
    for (const [key, attempt] of latestByExamId) {
      // Дедлайн мог истечь между стартом попытки и этим запросом — статус
      // должен быть правдой прямо сейчас, тем же правилом, что у /attempts
      // (ExamAttemptsService.list).
      const closed = await closeIfExpiredAttempt(this.attemptModel, attempt, now);
      result.set(key, {
        attemptsUsed: attemptsUsedByExamId.get(key) ?? 0,
        lastAttempt: { id: closed._id.toString(), status: closed.status },
      });
    }
    return result;
  }
}
