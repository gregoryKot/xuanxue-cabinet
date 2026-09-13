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
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  ATTEMPT_EXPIRED_MESSAGE,
  ATTEMPT_NOT_FOUND_MESSAGE,
  ATTEMPT_NOT_IN_PROGRESS_MESSAGE,
  EXAM_NOT_PUBLISHED_MESSAGE,
  isStaffRole,
  LIST_LIMIT_DEFAULT,
  pluralRu,
  type AttemptAnswerDto,
  type ExamAttemptDto,
  type ListAttemptsQuery,
  type SaveAttemptAnswersInput,
} from '@xuanxue/shared';
import { InvalidInputError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import { UserNamesService } from '../users/user-names.service';
import type { UserLean } from '../users/users.service';
import { ExamItemsService } from './exam-items.service';
import { assertAnswersKnown, mergeAnswers } from './exam-attempt-answers';
import { closeIfExpiredAttempt, findInProgressAttempt } from './exam-attempt-lifecycle';
import { buildAttemptBlocks } from './exam-attempt-snapshot';
import { EXAM_ATTEMPT_ENCRYPT_SCHEMA, ExamAttemptRecord } from './exam-attempt.schema';
import {
  decryptAttempt,
  toAttemptDto,
  type LeanExamAttempt,
  type RawLeanExamAttempt,
} from './exam-attempt.mapper';
import { ExamsService } from './exams.service';

// Склонение «попытки» в тексте отказа при превышении attemptsAllowed —
// своя форма, отдельная от QUESTION_FORMS (exam-blocks.ts): разные слова.
const ATTEMPT_FORMS = {
  one: 'попытку',
  few: 'попытки',
  many: 'попыток',
  other: 'попытки',
} as const;

function attemptsExceededMessage(attemptsUsed: number): string {
  return (
    `Вы использовали ${attemptsUsed} ${pluralRu(attemptsUsed, ATTEMPT_FORMS)} из ` +
    'разрешённых на этот экзамен. Попросите учителя открыть ещё одну попытку.'
  );
}

@Injectable()
export class ExamAttemptsService {
  constructor(
    @InjectModel(ExamAttemptRecord.name) private readonly model: Model<ExamAttemptRecord>,
    private readonly examsService: ExamsService,
    private readonly examItemsService: ExamItemsService,
    private readonly userNamesService: UserNamesService,
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
    if (existing)
      return toAttemptDto(await closeIfExpiredAttempt(this.model, existing, now));

    const attemptsUsed = await this.model.countDocuments({ examId, userId });
    if (attemptsUsed >= exam.attemptsAllowed) {
      throw new InvalidInputError(attemptsExceededMessage(attemptsUsed));
    }

    const itemIds = [...new Set(exam.blocks.flatMap((block) => block.itemIds))];
    const items = await Promise.all(
      itemIds.map((id) => this.examItemsService.getById(id)),
    );
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const blocks = buildAttemptBlocks(exam.blocks, itemsById, Math.random);
    const deadlineAt = exam.timeLimitMin
      ? now.plus({ minutes: exam.timeLimitMin })
      : undefined;

    const payload: Record<string, unknown> = {
      examId,
      examTitle: exam.title,
      userId,
      attemptNo: attemptsUsed + 1,
      status: 'in_progress',
      blocks,
      answers: [] as AttemptAnswerDto[],
      startedAt: now.toJSDate(),
      deadlineAt: deadlineAt?.toJSDate(),
    };

    try {
      const created = await this.model.create(
        encryptRecord(payload, EXAM_ATTEMPT_ENCRYPT_SCHEMA),
      );
      const doc = await this.model.findById(created._id).lean<RawLeanExamAttempt>();
      if (!doc) throw new Error('start: попытка не найдена сразу после создания');
      return toAttemptDto(decryptAttempt(doc));
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      // Гонка двух стартов подряд (двойной клик на телефоне) — конкурент уже
      // занял этот attemptNo первым; не плодим вторую попытку, отдаём его
      // (идемпотентность, ТЗ 4.4, п.3).
      const raced = await findInProgressAttempt(this.model, examId, userId);
      if (raced) return toAttemptDto(raced);
      throw err;
    }
  }

  /** ТЗ 4.4, п.4–5: только владелец, только `in_progress`, только до
   * дедлайна; ответы заменяют по `itemId`, остальные не трогаются; чужой
   * `itemId` — 400. */
  async saveAnswers(
    attemptId: string,
    userId: string,
    input: SaveAttemptAnswersInput,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.loadOwn(attemptId, userId, now);
    this.assertOpenForChange(attempt);
    assertAnswersKnown(attempt.blocks, input.answers);

    const answers = mergeAnswers(attempt.answers, input.answers);
    const updated = await this.model
      .findOneAndUpdate(
        { _id: attemptId, userId, status: 'in_progress' },
        { $set: encryptRecord({ answers }, EXAM_ATTEMPT_ENCRYPT_SCHEMA) },
        { returnDocument: 'after' },
      )
      .lean<RawLeanExamAttempt>();
    // Гонка: дедлайн истёк между проверкой выше и этим апдейтом — тот же
    // отказ, что и обычное «время вышло» (ТЗ 4.4, п.7).
    if (!updated) throw new InvalidInputError(ATTEMPT_EXPIRED_MESSAGE);
    return toAttemptDto(decryptAttempt(updated));
  }

  /** ТЗ 4.4, п.6: владелец, `in_progress` → `submitted`, `submittedAt` = сейчас. */
  async submit(
    attemptId: string,
    userId: string,
    now: DateTime,
  ): Promise<ExamAttemptDto> {
    const attempt = await this.loadOwn(attemptId, userId, now);
    this.assertOpenForChange(attempt);

    const updated = await this.model
      .findOneAndUpdate(
        { _id: attemptId, userId, status: 'in_progress' },
        { $set: { status: 'submitted', submittedAt: now.toJSDate() } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanExamAttempt>();
    if (!updated) throw new InvalidInputError(ATTEMPT_EXPIRED_MESSAGE);
    return toAttemptDto(decryptAttempt(updated));
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
    const attempts = await Promise.all(
      docs.map((doc) => closeIfExpiredAttempt(this.model, decryptAttempt(doc), now)),
    );
    // Имя ученика — только сотруднику школы и одним запросом на весь
    // список, не по документу (ExamAttemptDto.userName, shared/src/exams.ts).
    const names = isStaff
      ? await this.userNamesService.namesByIds(
          attempts.map((attempt) => attempt.userId.toString()),
        )
      : undefined;
    return attempts.map((attempt) =>
      toAttemptDto(attempt, names?.get(attempt.userId.toString())),
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
    return closeIfExpiredAttempt(this.model, decryptAttempt(doc), now);
  }

  private assertOpenForChange(attempt: LeanExamAttempt): void {
    if (attempt.expired) throw new InvalidInputError(ATTEMPT_EXPIRED_MESSAGE);
    if (attempt.status !== 'in_progress') {
      throw new InvalidInputError(ATTEMPT_NOT_IN_PROGRESS_MESSAGE);
    }
  }
}
