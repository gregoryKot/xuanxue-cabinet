// CRUD ожидания бота в чате (bot-session.schema.ts) — единственная точка
// чтения/записи `bot_sessions`, тем же приёмом, что UsersService для users.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import { BotSessionRecord, type BotSessionKind } from './bot-session.schema';

// Предпросмотр «Изменить тему» ждёт ответ недолго (PLAN.md §6).
const TOPIC_WAIT_MINUTES = 10;

export interface BotSessionLean {
  kind: BotSessionKind;
  lessonId: Types.ObjectId;
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

  /** Активное (не истёкшее) ожидание чата — TTL-индекс подчищает документ с
   * задержкой до минуты (SERVER-точность монитора Mongo), поэтому фильтр по
   * `expiresAt` здесь же, не только надежда на TTL. */
  async get(chatId: number, now: DateTime): Promise<BotSessionLean | null> {
    return this.model
      .findOne({ chatId, expiresAt: { $gt: now.toJSDate() } }, { kind: 1, lessonId: 1 })
      .lean<BotSessionLean | null>();
  }

  async clear(chatId: number): Promise<void> {
    await this.model.deleteOne({ chatId });
  }

  /** Документ есть, но `expiresAt` уже прошёл — отличить «никогда не ждали»
   * (тихо игнорируем чужое сообщение) от «ждали, но учитель не успел»: во
   * втором случае бот отвечает, что ожидание истекло, а не молчит. TTL может
   * не успеть подчистить документ (задержка до минуты, как в get()) — фильтр
   * по `expiresAt` тот же приём. */
  async hasExpired(chatId: number, now: DateTime): Promise<boolean> {
    const count = await this.model.countDocuments({
      chatId,
      expiresAt: { $lte: now.toJSDate() },
    });
    return count > 0;
  }

  private async set(
    chatId: number,
    kind: BotSessionKind,
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
