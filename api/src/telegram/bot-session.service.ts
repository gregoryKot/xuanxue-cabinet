// CRUD ожидания бота в чате (bot-session.schema.ts) — единственная точка
// чтения/записи `bot_sessions`, тем же приёмом, что UsersService для users.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { BotSessionRecord, type BotSessionKind } from './bot-session.schema';

// Предпросмотр «Изменить тему» и команда /тема ждут ответ недолго — 10 минут
// (PLAN.md §6); «Запись?» и видео экзамена ждут куда дольше — снять и найти
// время на отправку можно не сразу, 12 часов.
const TOPIC_WAIT_MINUTES = 10;
const RECORDING_WAIT_HOURS = 12;
const EXAM_MEDIA_WAIT_HOURS = 12;

export interface BotSessionLean {
  kind: BotSessionKind;
  /** Есть только у kind 'topic'/'recording'. */
  lessonId?: Types.ObjectId;
  /** Есть только у kind 'examMedia'. */
  attemptId?: Types.ObjectId;
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

  /** Ждём видео экзамена после deep link `t.me/<бот>?start=exam_<attemptId>`
   * (ADR-0023, PLAN §11 слой 4.5) — открыт ЛЮБОМУ пользователю Telegram, не
   * через `set()`: то ведёт только `lessonId`, это — только `attemptId`. */
  async startExamMediaWait(
    chatId: number,
    attemptId: string,
    now: DateTime,
  ): Promise<void> {
    await this.model.updateOne(
      { chatId },
      {
        $set: {
          kind: 'examMedia',
          attemptId: new Types.ObjectId(attemptId),
          expiresAt: now.plus({ hours: EXAM_MEDIA_WAIT_HOURS }).toJSDate(),
        },
      },
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
        { kind: 1, lessonId: 1, attemptId: 1 },
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
