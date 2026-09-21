// Попытка сдачи экзамена (ТЗ 4.4, ADR-0022 + дополнение 2026-09-12). Данные
// ученика (ADR-0010): каждая выборка/правка скоупится по владельцу из сессии
// (SECURITY §3) — `userId` в фильтре, а не сравнение после чтения. Снимок
// формы и перемешивание — один раз при старте (exam-attempt-snapshot.ts);
// время считает сервер, Luxon (closeIfExpiredAttempt), не часы клиента
// (ТЗ 4.4, п.7) — сама проверка дедлайна и поиск попытки «в работе» — в
// exam-attempt-lifecycle.ts, чтобы этот файл оставался диспетчером правил, а
// не Mongo-запросов (CLAUDE.md «Файлы», лимит размера).
//
// Вопросы блоков читаются через `ExamsService`/`ExamItemsService`, а не
// напрямую через их модели: там уже есть проверка published-статуса формы,
// шифрование и декрипт содержимого вопроса (prompt/hint/criteria/options) —
// дублировать эту расшифровку здесь было бы вторым местом одной механики
// (CLAUDE.md «Одна механика — один компонент»).
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  ATTEMPT_NOT_FOUND_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  isStaffRole,
  LIST_LIMIT_DEFAULT,
  type ExamAttemptDto,
  type ListAttemptsQuery,
  type SaveAttemptAnswersInput,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserNamesService } from '../users/user-names.service';
import type { UserLean } from '../users/users.service';
import { attemptsExceededMessage } from './attempts-exceeded-message';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { createAttempt } from './exam-attempt-start';
import { ExamItemsService } from './exam-items.service';
import {
  assertOpenForChange,
  closeIfExpiredAttempt,
  findInProgressAttempt,
} from './exam-attempt-lifecycle';
import { saveAttemptAnswers } from './exam-attempt-save';
import { resolveSubmitConflict } from './exam-attempt-submit-outcome';
import {
  attemptSubmittedCallback,
  notifyAttemptSubmitted,
} from './notify-attempt-submitted';
import { ExamAttemptRecord } from './exam-attempt.schema';
import {
  decryptAttempt,
  toAttemptDto,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import { listGradingsForAttempts } from './exam-grading-list';
import { ExamGradingRecord } from './exam-grading.schema';
import { ExamsService } from './exams.service';

@Injectable()
export class ExamAttemptsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name) private readonly model: Model<ExamAttemptRecord>,
    @InjectModel(ExamGradingRecord.name)
    private readonly gradingModel: Model<ExamGradingRecord>,
    private readonly examsService: ExamsService,
    private readonly examItemsService: ExamItemsService,
    private readonly userNamesService: UserNamesService,
    @Inject(EXAM_NOTIFIER) private readonly examNotifier: ExamNotifier,
  ) {}

  /** ТЗ 4.4, п.1–3: экзамен должен быть опубликован; незаконченная попытка
   * возвращается, а не заводится новая; больше `attemptsAllowed` попыток не
   * заводится — атомарно, через уникальный индекс, не «посчитали и вставили». */
  async start(examId: string, userId: string, now: DateTime): Promise<ExamAttemptDto> {
    const exam = await this.examsService.getById(examId);
    if (exam.status !== 'published') {
      throw new InvalidInputError(EXAM_NOT_PUBLISHED_MESSAGE);
    }

    const existing = await findInProgressAttempt(this.model, examId, userId);
    if (existing) {
      const closed = await closeIfExpiredAttempt(
        this.model,
        existing,
        now,
        attemptSubmittedCallback(this.examNotifier, now),
      );
      return toAttemptDto(closed);
    }

    const attemptsUsed = await this.model.countDocuments({ examId, userId });
    if (attemptsUsed >= exam.attemptsAllowed) {
      throw new InvalidInputError(attemptsExceededMessage(attemptsUsed));
    }

    return createAttempt(
      this.model,
      this.examItemsService,
      exam,
      userId,
      attemptsUsed,
      now,
    );
  }

  /** ТЗ 4.4, п.4–5: только владелец, только `in_progress`, только до
   * дедлайна; ответы заменяют по `itemId`, остальные не трогаются; чужой
   * `itemId` — 400. Атомарный апдейт с оптимистичной блокировкой
   * (exam-attempt-save.ts, находка аудита PR #175, docs/PLAN.md §11) —
   * бот и кабинет одной секундой не затирают ответ друг друга. */
  async saveAnswers(
    attemptId: string,
    userId: string,
    input: SaveAttemptAnswersInput,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await saveAttemptAnswers(
      this.model,
      this.examNotifier,
      attemptId,
      userId,
      input,
      now,
    );
    return toAttemptDto(attempt);
  }

  /** ТЗ 4.4, п.6: владелец, `in_progress` → `submitted`, `submittedAt` = сейчас. */
  async submit(
    attemptId: string,
    userId: string,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.loadOwn(attemptId, userId, now);
    assertOpenForChange(attempt);

    const updated = await this.model
      .findOneAndUpdate(
        { _id: attemptId, userId, status: 'in_progress' },
        { $set: { status: 'submitted', submittedAt: now.toJSDate() } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanExamAttempt>();
    if (!updated)
      return toAttemptDto(await resolveSubmitConflict(this.model, attemptId, userId));
    const decrypted = decryptAttempt(updated);
    // Выиграл гонку выше — ровно одно уведомление (closeIfExpiredAttempt, шапка файла).
    notifyAttemptSubmitted(this.examNotifier, decrypted, now);
    return toAttemptDto(decrypted);
  }

  /** ТЗ 4.4, п.9: ученику — только свои, учителю/админу — все, фильтры
   * `examId`/`status`, лимит как везде (данные ученика — по владельцу,
   * SECURITY §3; для роли teacher/admin — как данные школы, по роли). */
  async list(
    query: ListAttemptsQuery,
    user: UserLean,
    now: DateTime,
  ): Promise<ExamAttemptDto[]> {
    // Помощник учителя правами равен учителю (STAFF_ROLES, shared/auth.ts).
    const isStaff = isStaffRole(user.roles);
    const filter: Record<string, unknown> = {};
    if (!isStaff) filter.userId = user.id;
    if (query.examId !== undefined) filter.examId = query.examId;
    if (query.status !== undefined) filter.status = query.status;

    const docs = await this.model
      .find(filter)
      .sort({ startedAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<RawLeanExamAttempt[]>();
    const onClose = attemptSubmittedCallback(this.examNotifier, now);
    const attempts = await Promise.all(
      docs.map((doc) =>
        closeIfExpiredAttempt(this.model, decryptAttempt(doc), now, onClose),
      ),
    );
    // Имя ученика и оценка — только сотруднику школы и одним запросом на
    // весь список, не по документу (ExamAttemptDto.userName/outcome/gradedAt,
    // shared/src/exams.ts).
    const names = isStaff
      ? await this.userNamesService.namesByIds(
          attempts.map((attempt) => attempt.userId.toString()),
        )
      : undefined;
    const gradings = isStaff
      ? await listGradingsForAttempts(
          this.gradingModel,
          attempts.map((attempt) => attempt._id.toString()),
        )
      : undefined;
    return attempts.map((attempt) =>
      toAttemptDto(
        attempt,
        names?.get(attempt.userId.toString()),
        gradings?.get(attempt._id.toString()),
      ),
    );
  }

  /** Владелец из сессии, не из пути (SECURITY §3) — чужой `id` получает
   * `ATTEMPT_NOT_FOUND_MESSAGE`, не 403: не подтверждаем даже факт
   * существования чужой попытки. Лениво закрывает попытку по дедлайну —
   * «любой запрос после дедлайна» (ТЗ 4.4, п.7), не только явный тик. */
  private async loadOwn(
    attemptId: string,
    userId: string,
    now: DateTime,
  ): Promise<LeanExamAttempt> {
    assertObjectId(attemptId, ATTEMPT_NOT_FOUND_MESSAGE);
    const doc = await this.model
      .findOne({ _id: attemptId, userId })
      .lean<RawLeanExamAttempt>();
    if (!doc) throw new NotFoundError(ATTEMPT_NOT_FOUND_MESSAGE);
    return closeIfExpiredAttempt(
      this.model,
      decryptAttempt(doc),
      now,
      attemptSubmittedCallback(this.examNotifier, now),
    );
  }
}
