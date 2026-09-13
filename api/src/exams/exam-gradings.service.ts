// Проверка попытки по рубрике (`GET /attempts/:id/review`, `PUT
// /attempts/:id/grading`, слой 4.6, PLAN §11, ADR-0022). Маршруты закрыты
// ролью teacher/assistant/admin на уровне контроллера (ExamAttemptsController)
// — владения здесь нет, проверяющий по сути своей роли видит чужую работу;
// сама оценка (`exam_gradings`) при этом данные ученика (чеклист CLAUDE.md,
// USER_OWNED_COLLECTIONS) — по `userId` идёт удаление аккаунта. Инкапсулирует
// шифрование (criteria/comment) и идемпотентность PUT — контроллер только
// валидирует тело и зовёт.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  ATTEMPT_NOT_SUBMITTED_MESSAGE,
  type AttemptReviewDto,
  type ExamGradingDto,
  type PutGradingInput,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import { buildReviewBlocks } from './exam-attempt-review';
import { buildGradingCriteria } from './exam-grading-criteria';
import {
  decryptAttempt,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import { ExamAttemptRecord } from './exam-attempt.schema';
import {
  decryptGrading,
  toGradingDto,
  type RawLeanExamGrading,
} from './exam-grading.mapper';
import { EXAM_GRADING_ENCRYPT_SCHEMA, ExamGradingRecord } from './exam-grading.schema';
import { ExamsService } from './exams.service';

@Injectable()
export class ExamGradingsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    private readonly examsService: ExamsService,
  ) {}

  /** ТЗ 4.6, п.3: ответы рядом с критериями вопроса и правильностью
   * вариантов (снимок попытки, не банк — вопрос могли переписать), текущая
   * рубрика экзамена и уже выставленная оценка, если есть. */
  async getReview(attemptId: string): Promise<AttemptReviewDto> {
    const attempt = await this.loadAttempt(attemptId);
    const exam = await this.examsService.getById(attempt.examId.toString());
    const grading = await this.findGradingDto(attemptId);
    return {
      attemptId: attempt._id.toString(),
      examId: attempt.examId.toString(),
      examTitle: attempt.examTitle,
      userId: attempt.userId.toString(),
      status: attempt.status,
      blocks: buildReviewBlocks(attempt.blocks, attempt.answers),
      rubric: exam.rubric,
      grading,
    };
  }

  /** ТЗ 4.6, п.2: выставить или переписать оценку — идемпотентно по
   * уникальному индексу `attemptId` (upsert; гонка двух PUT — E11000 ловит
   * второй апдейт, тот же приём, что старт попытки, ExamAttemptsService.start).
   * После успеха попытка переходит в `graded`. Проверить можно только
   * сданную (или уже проверенную) работу, не черновик в работе. */
  async grade(
    attemptId: string,
    graderId: string,
    input: PutGradingInput,
    now: DateTime,
  ): Promise<ExamGradingDto> {
    const attempt = await this.loadAttempt(attemptId);
    if (attempt.status === 'in_progress') {
      throw new InvalidInputError(ATTEMPT_NOT_SUBMITTED_MESSAGE);
    }
    const exam = await this.examsService.getById(attempt.examId.toString());
    const criteria = buildGradingCriteria(exam.rubric, input.criteria);

    const payload = encryptRecord(
      {
        attemptId: attempt._id,
        examId: attempt.examId,
        userId: attempt.userId,
        graderId,
        criteria,
        comment: input.comment,
        outcome: input.outcome,
        gradedAt: now.toJSDate(),
      },
      EXAM_GRADING_ENCRYPT_SCHEMA,
    );

    try {
      await this.gradingModel.updateOne(
        { attemptId: attempt._id },
        { $set: payload },
        { upsert: true },
      );
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      await this.gradingModel.updateOne({ attemptId: attempt._id }, { $set: payload });
    }

    if (attempt.status !== 'graded') {
      await this.attemptModel.updateOne(
        { _id: attempt._id },
        { $set: { status: 'graded' } },
      );
    }

    const dto = await this.findGradingDto(attemptId);
    if (!dto) throw new Error('grade: оценка не найдена сразу после сохранения');
    return dto;
  }

  private async loadAttempt(attemptId: string): Promise<LeanExamAttempt> {
    assertObjectId(attemptId, ATTEMPT_NOT_FOUND_MESSAGE);
    const doc = await this.attemptModel.findById(attemptId).lean<RawLeanExamAttempt>();
    if (!doc) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    return decryptAttempt(doc);
  }

  private async findGradingDto(attemptId: string): Promise<ExamGradingDto | undefined> {
    const doc = await this.gradingModel.findOne({ attemptId }).lean<RawLeanExamGrading>();
    return doc ? toGradingDto(decryptGrading(doc)) : undefined;
  }
}
