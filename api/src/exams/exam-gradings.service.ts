// Проверка попытки (`GET /attempts/:id/review`, `PUT
// /attempts/:id/grading`, слой 4.6, PLAN §11, ADR-0022). Маршруты закрыты
// ролью teacher/assistant/admin на уровне контроллера (ExamAttemptsController)
// — владения здесь нет, проверяющий по сути своей роли видит чужую работу;
// сама оценка (`exam_gradings`) при этом данные ученика (чеклист CLAUDE.md,
// USER_OWNED_COLLECTIONS) — по `userId` идёт удаление аккаунта. Инкапсулирует
// шифрование (comment) и идемпотентность PUT — контроллер только валидирует
// тело и зовёт.
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  ATTEMPT_NOT_SUBMITTED_MESSAGE,
  DELETED_USER_NAME,
  type AttemptReviewDto,
  type ExamGradingDto,
  type NotificationKind,
  type PutGradingInput,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { PersonalChats } from '../telegram/personal-chats';
import { encryptRecord } from '../utils/encryption';
import { UserNamesService } from '../users/user-names.service';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { didGradingChange } from './grading-changed';
import { notifyExamGraded } from './notify-exam-graded';
import { buildReviewBlocks } from './exam-attempt-review';
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

// Тот же вид уведомления, что реально шлёт TelegramExamNotifier.notifyExamGraded
// (именованная константа рядом с использованием — CLAUDE.md «Магические
// строки», тот же приём, что EXAM_RESULT_KIND в exam-notifier.composite.ts).
const EXAM_RESULT_KIND: NotificationKind = 'exam_result';

@Injectable()
export class ExamGradingsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name)
    private readonly attemptModel: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    private readonly userNamesService: UserNamesService,
    private readonly personalChats: PersonalChats,
    @Inject(EXAM_NOTIFIER) private readonly examNotifier: ExamNotifier,
  ) {}

  /** ТЗ 4.6, п.3: ответы рядом с критериями вопроса и правильностью
   * вариантов (снимок попытки, не банк — вопрос могли переписать) и уже
   * выставленная оценка, если есть. Признак `notifiesUserInTelegram`
   * считаем здесь, а не в контроллере (ADR-0102, отзыв владельца
   * 2026-09-21): карточку строит ещё и бот (ExamBotPort.loadAttemptReview →
   * ExamBotService.loadAttemptReview зовёт этот же getReview), второй
   * сборки того же контракта в контроллере быть не должно — иначе экран и
   * бот однажды разъедутся условием. */
  async getReview(attemptId: string): Promise<AttemptReviewDto> {
    const attempt = await this.loadAttempt(attemptId);
    const grading = await this.findGradingDto(attemptId);
    const userId = attempt.userId.toString();
    // Не пустая строка, если аккаунт уже удалён (аудит В11): DELETED_USER_NAME.
    const names = await this.userNamesService.namesByIds([userId]);
    const chat = await this.personalChats.chatFor(userId, EXAM_RESULT_KIND);
    return {
      attemptId: attempt._id.toString(),
      examId: attempt.examId.toString(),
      examTitle: attempt.examTitle,
      userId,
      userName: names.get(userId) ?? DELETED_USER_NAME,
      status: attempt.status,
      blocks: buildReviewBlocks(attempt.blocks, attempt.answers),
      notifiesUserInTelegram: chat !== null,
      grading,
    };
  }

  /** ТЗ 4.6, п.2: выставить или переписать оценку — идемпотентно по
   * уникальному индексу `attemptId` (upsert; гонка двух PUT — E11000 ловит
   * второй апдейт, тот же приём, что старт попытки, ExamAttemptsService.start).
   * После успеха попытка переходит в `graded`. Проверить можно только
   * сданную (или уже проверенную) работу, не черновик в работе. Уведомление
   * ученику (слой 4.7, PLAN §11) — на каждый вызов, включая переписанную
   * оценку: без требования «раз за жизнь попытки», в отличие от attempt_submitted. */
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
    // Снимок «до записи» — только для сравнения в didGradingChange() ниже
    // (аудит 2026-09, находка 3), сам ответ строится из dto «после записи».
    const previousDto = await this.findGradingDto(attemptId);

    const payload = encryptRecord(
      {
        attemptId: attempt._id,
        examId: attempt.examId,
        userId: attempt.userId,
        graderId,
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

    // Не ждём и не роняем PUT из-за бота (CLAUDE.md «Встраивание в сервисы»).
    // Уведомление — только если решение или комментарий реально изменились
    // (аудит 2026-09, находка 3): повторный идемпотентный PUT с теми же
    // значениями (учитель нажал «Сохранить» дважды после сетевого сбоя) не
    // должен слать ученику второе «Нужно доработать».
    if (didGradingChange(previousDto, input)) {
      notifyExamGraded(this.examNotifier, attempt, input.outcome, input.comment, now);
    }
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
