// CRUD ожидания бота в чате (bot-session.schema.ts) — единственная точка
// чтения/записи `bot_sessions`, тем же приёмом, что UsersService для users.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { BotSessionRecord, type BotSessionKind } from './bot-session.schema';
import { examAnswerWaitUpdate } from './exam-answer-wait';

// Предпросмотр «Изменить тему» и команда /тема ждут ответ недолго — 10 минут
// (PLAN.md §6); «Запись?» ждёт куда дольше — снять запись можно не сразу
// (EXAM_ANSWER_WAIT_HOURS в exam-answer-wait.ts — то же число для ответа на
// вопрос экзамена, по той же причине).
const TOPIC_WAIT_MINUTES = 10;
const RECORDING_WAIT_HOURS = 12;

export interface BotSessionLean {
  kind: BotSessionKind;
  /** Есть только у kind 'topic'/'recording'. */
  lessonId?: Types.ObjectId;
  /** Есть только у kind 'examMedia'/'examText'. */
  attemptId?: Types.ObjectId;
  /** Номер вопроса (bot-session.schema.ts) — есть у 'examText' всегда, у
   * 'examMedia' только внутри потока вопросов бота. */
  questionIndex?: number | null;
}

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

  /** Ждём видео экзамена — либо после deep link
   * `t.me/<бот>?start=exam_<attemptId>` (ADR-0023, `questionIndex` не
   * передан), либо с экрана вопроса-видео внутри потока бота (ТЗ 4б.2 часть
   * 2, `questionIndex` передан) — открыт ЛЮБОМУ пользователю Telegram, не
   * через `set()`: то ведёт только `lessonId`, это — только `attemptId`.
   * Само содержимое апдейта — exam-answer-wait.ts, комментарий там же. */
  async startExamMediaWait(
    chatId: number,
    attemptId: string,
    now: DateTime,
    questionIndex?: number,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      { $set: examAnswerWaitUpdate('examMedia', attemptId, questionIndex, now) },
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

  /** Активное (не истёкшее) ожидание чата — TTL-индекс подчищает документ с
   * задержкой до минуты (SERVER-точность монитора Mongo), поэтому фильтр по
   * `expiresAt` здесь же, не только надежда на TTL. */
  async get(chatId: number, now: DateTime): Promise<BotSessionLean | null> {
    return this.model
      .findOne(
        { chatId, expiresAt: { $gt: now.toJSDate() } },
        { kind: 1, lessonId: 1, attemptId: 1, questionIndex: 1 },
      )
      .lean<BotSessionLean | null>();
  }

  async clear(chatId: number): Promise<void> {
    await this.model.deleteOne({ chatId });
  }

  /** Закрывает ожидание, только если оно про ЭТО занятие («Записи не будет»
   * под конкретным «Запись?» — CLAUDE.md «Ноль нагрузки» наоборот: чужую,
   * более новую просьбу той же кнопкой не гасим). Учитель успел получить
   * второй вопрос «Запись?» по другому занятию раньше, чем ответил на
   * первый, — «Записи не будет» под первым не должно погасить ожидание
   * второго. */
  async clearIfLesson(chatId: number, lessonId: string): Promise<void> {
    await this.model.deleteOne({ chatId, lessonId: new Types.ObjectId(lessonId) });
  }

  /** Документ есть, но `expiresAt` уже прошёл — отличить «никогда не ждали»
   * (тихо игнорируем чужое сообщение) от «ждали, но учитель не успел»: во
   * втором случае бот отвечает, что ожидание истекло, а не молчит, причём
   * текст разный для темы и записи (message.handler.ts) — поэтому возвращаем
   * `kind`, а не просто факт. TTL может не успеть подчистить документ
   * (задержка до минуты, как в get()) — фильтр по `expiresAt` тот же приём. */
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
