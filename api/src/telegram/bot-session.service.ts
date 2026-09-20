// CRUD ожидания бота в чате (bot-session.schema.ts) — единственная точка
// чтения/записи `bot_sessions`, тем же приёмом, что UsersService для users.
// Тип прочитанного ожидания (BotSessionLean) и его расшифровка — в
// bot-session.lean.ts (вынесено, чтобы этот файл не рос — CLAUDE.md,
// храповик check-file-size-ratchet.mjs).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { ExamItemKind, GradingOutcome } from '@xuanxue/shared';
import { encryptRecord } from '../utils/encryption';
import {
  BOT_SESSION_LEAN_PROJECTION,
  toBotSessionLean,
  type BotSessionLean,
  type RawBotSessionLean,
} from './bot-session.lean';
import {
  BOT_SESSION_ENCRYPT_SCHEMA,
  BotSessionRecord,
  type BotSessionKind,
} from './bot-session.schema';
import { examAnswerWaitUpdate } from './exam-answer-wait';
import {
  newExamDraftUpdate,
  startNewExamDraftUpdate,
  type NewExamDraftPatch,
} from './new-exam-draft-wait';
import {
  newExamItemDraftUpdate,
  startNewExamItemDraftUpdate,
  type NewExamItemDraftPatch,
} from './new-exam-item-draft-wait';
import { paymentWaitUpdate } from './payment-wait';

// Предпросмотр «Изменить тему» и команда /тема ждут ответ недолго — 10 минут
// (PLAN.md §6); «Запись?» ждёт куда дольше — снять запись можно не сразу
// (EXAM_ANSWER_WAIT_HOURS в exam-answer-wait.ts — то же число для ответа на
// вопрос экзамена, по той же причине).
const TOPIC_WAIT_MINUTES = 10;
const RECORDING_WAIT_HOURS = 12;
// Комментарий проверки (ТЗ 4б.5) — короткое действие, тот же порядок, что у
// темы: проверяющий ставит его тут же, не откладывая на потом.
const GRADE_COMMENT_WAIT_MINUTES = 10;

@Injectable()
export class BotSessionService {
  constructor(
    @InjectModel(BotSessionRecord.name) private readonly model: Model<BotSessionRecord>,
  ) {}

  /** Новое ожидание вытесняет старое — один документ на чат (upsert по
   * уникальному индексу `chatId`), учитель отвечает на последнее, что видит. */
  async startTopicWait(chatId: number, lessonId: string, now: DateTime): Promise<void> {
    await this.set(chatId, 'topic', lessonId, now.plus({ minutes: TOPIC_WAIT_MINUTES }));
  }

  async startRecordingWait(
    chatId: number,
    lessonId: string,
    now: DateTime,
  ): Promise<void> {
    await this.set(
      chatId,
      'recording',
      lessonId,
      now.plus({ hours: RECORDING_WAIT_HOURS }),
    );
  }

  /** Ждём видео экзамена — deep link `exam_<attemptId>[_<itemId>]`
   * (ADR-0023/ADR-0037, `questionIndex` не передан) либо экран вопроса-видео
   * потока бота (оба переданы) — открыт ЛЮБОМУ Telegram, не через `set()`
   * (тот ведёт lessonId, этот — attemptId/itemId); апдейт — exam-answer-wait.ts. */
  async startExamMediaWait(
    chatId: number,
    attemptId: string,
    now: DateTime,
    questionIndex?: number,
    itemId?: string,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: examAnswerWaitUpdate('examMedia', attemptId, questionIndex, now, itemId) },
      { upsert: true },
    );
  }

  /** Ждём свободный текст ответа на вопрос попытки (ТЗ 4б.2 часть 2) — экран
   * вопроса ставит это ожидание при каждом показе text-вопроса
   * (exam-question-render.ts), номер вопроса обязателен: без него закрывать
   * ожидание после ответа было бы нечем адресовать. */
  async startExamTextWait(
    chatId: number,
    attemptId: string,
    questionIndex: number,
    now: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: examAnswerWaitUpdate('examText', attemptId, questionIndex, now) },
      { upsert: true },
    );
  }

  /** Ждём скриншот оплаты (ADR-0050, слой 2.2) — после deep link
   * `t.me/<бот>?start=pay_<YYYY-MM>`, открыт любому Telegram; апдейт — payment-wait.ts. */
  async startPaymentWait(chatId: number, month: string, now: DateTime): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: paymentWaitUpdate(month, now) },
      { upsert: true },
    );
  }

  /** Активное (не истёкшее) ожидание — фильтр по `expiresAt` не только
   * надежда на TTL (задержка до минуты, SERVER-точность Mongo). Проекция и
   * расшифровка draft*-полей — bot-session.lean.ts (toBotSessionLean):
   * читающий мимо этого метода получил бы шифротекст. */
  async get(chatId: number, now: DateTime): Promise<BotSessionLean | null> {
    const doc = await this.model
      .findOne(
        { chatId, expiresAt: { $gt: now.toJSDate() } },
        BOT_SESSION_LEAN_PROJECTION,
      )
      .lean<RawBotSessionLean | null>();
    if (!doc) return null;
    return toBotSessionLean(doc);
  }

  /** Начинает черновик вопроса (screen 1, ТЗ 4б.3) — новое ожидание
   * вытесняет старое, тем же приёмом, что startTopicWait. */
  async startNewExamItemDraft(
    chatId: number,
    kind: ExamItemKind,
    now: DateTime,
  ): Promise<void> {
    const { $set, $unset } = startNewExamItemDraftUpdate(kind, now);
    await this.model.updateOne(
      { chatId },
      { $set: encryptRecord($set, BOT_SESSION_ENCRYPT_SCHEMA), $unset },
      { upsert: true },
    );
  }

  /** Шаг вперёд внутри уже начатого черновика (формулировка/варианты/
   * критерии/сохранение) — черновик копится в bot_sessions, а не в отдельной
   * коллекции (ADR-0024, комментарий у kind в bot-session.schema.ts).
   * Свободный текст/варианты шифруются перед записью тем же приёмом, что у
   * самого банка вопросов (ExamItemsService.create). */
  async setNewExamItemDraft(
    chatId: number,
    patch: NewExamItemDraftPatch,
    now: DateTime,
  ): Promise<void> {
    const update = encryptRecord(
      newExamItemDraftUpdate(patch, now),
      BOT_SESSION_ENCRYPT_SCHEMA,
    );
    await this.model.updateOne({ chatId }, { $set: update }, { upsert: true });
  }

  /** Начинает сборку экзамена (шаг 'pick', ТЗ 4б.4) — новое ожидание
   * вытесняет старое, тем же приёмом, что startNewExamItemDraft. */
  async startNewExamDraft(chatId: number, now: DateTime): Promise<void> {
    const { $set, $unset } = startNewExamDraftUpdate(now);
    await this.model.updateOne(
      { chatId },
      { $set: encryptRecord($set, BOT_SESSION_ENCRYPT_SCHEMA), $unset },
      { upsert: true },
    );
  }

  /** Шаг вперёд внутри уже начатой сборки (отметка/название/лимит/попытки) —
   * тем же приёмом, что setNewExamItemDraft. */
  async setNewExamDraft(
    chatId: number,
    patch: NewExamDraftPatch,
    now: DateTime,
  ): Promise<void> {
    const update = encryptRecord(
      newExamDraftUpdate(patch, now),
      BOT_SESSION_ENCRYPT_SCHEMA,
    );
    await this.model.updateOne({ chatId }, { $set: update }, { upsert: true });
  }

  /** Ждём комментарий проверки (ТЗ 4б.5) — новое ожидание вытесняет старое,
   * тем же приёмом, что startTopicWait; `outcome` запоминаем сразу, чтобы
   * не спрашивать его снова после текста комментария. */
  async startGradeCommentWait(
    chatId: number,
    attemptId: string,
    outcome: GradingOutcome,
    now: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      {
        $set: {
          kind: 'gradeComment',
          attemptId: new Types.ObjectId(attemptId),
          outcome,
          expiresAt: now.plus({ minutes: GRADE_COMMENT_WAIT_MINUTES }).toJSDate(),
        },
      },
      { upsert: true },
    );
  }

  async clear(chatId: number): Promise<void> {
    await this.model.deleteOne({ chatId });
  }

  /** Закрывает ожидание только про ЭТО занятие («Записи не будет» под
   * конкретным «Запись?») — чужую, более новую просьбу той же кнопкой не
   * гасим (два «Запись?» подряд по разным занятиям, ответ на первое). */
  async clearIfLesson(chatId: number, lessonId: string): Promise<void> {
    await this.model.deleteOne({ chatId, lessonId: new Types.ObjectId(lessonId) });
  }

  /** Закрывает ожидание комментария только про ЭТУ попытку («Отмена» под
   * карточкой) — тот же приём, что clearIfLesson: `kind` в фильтре на случай
   * другого ожидания с тем же attemptId (examMedia/examText). */
  async clearIfAttempt(chatId: number, attemptId: string): Promise<void> {
    await this.model.deleteOne({
      chatId,
      attemptId: new Types.ObjectId(attemptId),
      kind: 'gradeComment',
    });
  }

  /** Документ есть, но `expiresAt` уже прошёл — отличить «никогда не ждали»
   * от «ждали, но не успели» (текст отличается по kind, message.handler.ts).
   * TTL может не успеть подчистить (задержка до минуты, как в get()). */
  async hasExpired(chatId: number, now: DateTime): Promise<BotSessionKind | null> {
    const doc = await this.model
      .findOne({ chatId, expiresAt: { $lte: now.toJSDate() } }, { kind: 1 })
      .lean<{ kind: BotSessionKind } | null>();
    return doc?.kind ?? null;
  }

  private async set(
    chatId: number,
    kind: 'topic' | 'recording',
    lessonId: string,
    expiresAt: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      {
        $set: {
          kind,
          lessonId: new Types.ObjectId(lessonId),
          expiresAt: expiresAt.toJSDate(),
        },
      },
      { upsert: true },
    );
  }
}
