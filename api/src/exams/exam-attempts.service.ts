// Попытка сдачи экзамена (ТЗ 4.4, ADR-0022 + дополнение 2026-09-12). Данные
// ученика (ADR-0010): каждая выборка/правка скоупится по владельцу из сессии
// (SECURITY §3) — `userId` в фильтре, а не сравнение после чтения. Снимок
// формы и перемешивание — один раз при старте (exam-attempt-snapshot.ts);
// время считает сервер, Luxon (closeIfExpiredAttempt), не часы клиента
// (ТЗ 4.4, п.7).
//
// Этот файл — диспетчер правил, не Mongo-запросов: дедлайн и поиск попытки
// «в работе» живут в exam-attempt-lifecycle.ts, срок сдачи — в
// exam-due-guard.ts, вопросы блоков — через `ExamsService`/`ExamItemsService`.
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  isStaffRole,
  LIST_LIMIT_DEFAULT,
  type ExamAttemptDto,
  type ListAttemptsQuery,
  type SaveAttemptAnswersInput,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';
import { UserNamesService } from '../users/user-names.service';
import type { UserLean } from '../users/users.service';
import { attemptsExceededMessage } from './attempts-exceeded-message';
import { buildAttemptListFilter } from './deleted-exam-ids';
import { EXAM_NOTIFIER, type ExamNotifier } from './exam-notifier';
import { createAttempt } from './exam-attempt-start';
import { ExamAttemptRetryCleanupService } from './exam-attempt-retry-cleanup.service';
import { loadOwnAttempt } from './exam-attempt-load-own';
import { ExamItemsService } from './exam-items.service';
import {
  assertOpenForChange,
  closeIfExpiredAttempt,
  findInProgressAttempt,
} from './exam-attempt-lifecycle';
import { assertExamNotPastDue, assertExamPublished } from './exam-start-guards';
import { saveAttemptAnswers } from './exam-attempt-save';
import { assertReasonsGiven } from './exam-attempt-submit-reason';
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
    private readonly retryCleanup: ExamAttemptRetryCleanupService,
  ) {}

  /** ТЗ 4.4, п.1–3: незаконченная попытка возвращается, а не заводится
   * новая; больше `attemptsAllowed` не заводится — атомарно, через уникальный
   * индекс, не «посчитали и вставили». Два отказа на входе (форма не
   * опубликована, срок сдачи прошёл) и порядок их проверок — в
   * exam-start-guards.ts. `attemptsUsed` — номер последней попытки, не число
   * документов (ADR-0131): затирание просроченной ниже не должно откатывать
   * лимит назад. */
  async start(examId: string, userId: string, now: DateTime): Promise<ExamAttemptDto> {
    const exam = await this.examsService.getById(examId);
    assertExamPublished(exam.status);

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

    assertExamNotPastDue(exam.dueAt, now);

    const lastAttempt = await this.retryCleanup.findLastAttempt(examId, userId);
    const attemptsUsed = lastAttempt?.attemptNo ?? 0;
    if (attemptsUsed >= exam.attemptsAllowed) {
      throw new InvalidInputError(attemptsExceededMessage(attemptsUsed));
    }

    const created = await createAttempt(
      this.model,
      this.examItemsService,
      exam,
      userId,
      attemptsUsed,
      now,
    );
    // Старую попытку — только после того, как новая точно создана: гонка
    // двойного старта не должна снести свежую (retryCleanup, шапка файла).
    if (lastAttempt) await this.retryCleanup.deleteIfExpiredUngraded(lastAttempt);
    return created;
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
    assertReasonsGiven(attempt);

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
    // Попытки удалённых форм (ADR-0140) не всплывают в списке ни у кого.
    const deletedIds = await this.examsService.deletedIds();
    const filter = buildAttemptListFilter(deletedIds, query, isStaff, user.id);

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
    // shared/src/exam-attempts.ts).
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

  private async loadOwn(
    attemptId: string,
    userId: string,
    now: DateTime,
  ): Promise<LeanExamAttempt> {
    return loadOwnAttempt({
      model: this.model,
      attemptId,
      userId,
      now,
      onClose: attemptSubmittedCallback(this.examNotifier, now),
    });
  }

  /** ADR-0126: своя попытка своим адресом, не список (было ?limit=200 на каждый тик). */
  async getOwn(
    attemptId: string,
    userId: string,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    return toAttemptDto(await this.loadOwn(attemptId, userId, now));
  }
}
