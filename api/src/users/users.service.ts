// Единственная точка чтения/записи UserRecord. Вход (виджет, сессия) — в
// api/src/auth/; здесь только CRUD с типизированным возвратом (контроллер/
// гвард не лезут в Mongoose напрямую, CLAUDE.md). Список и назначение ролей
// «Люди» — в user-roles.service.ts, чтобы этот файл не вырос за 150 строк.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  SCHOOL_TZ,
  type UserRole,
  type UserStatus,
} from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { UserRecord } from './user.schema';

/** Внутреннее представление пользователя — шире MeDto: гварду нужны status и
 * roles, а не только то, что видит интерфейс (toMeDto в auth/to-me.dto.ts). */
export interface UserLean {
  id: string;
  name: string;
  email?: string;
  telegramId?: number;
  googleId?: string;
  roles: UserRole[];
  tz: string;
  status: UserStatus;
  lastLoginAt?: Date;
}

export type UserDoc = UserRecord & { _id: Types.ObjectId };

/** Экспортирован для user-roles.service.ts — тот же маппер, не вторая реализация. */
export function toLean(doc: UserDoc): UserLean {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    telegramId: doc.telegramId,
    googleId: doc.googleId,
    roles: doc.roles,
    tz: doc.tz,
    status: doc.status,
    lastLoginAt: doc.lastLoginAt,
  };
}

@Injectable()
export class UsersService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** `id` из cookie — строка снаружи; невалидный ObjectId не ошибка сервера,
   * а «пользователя с таким id нет» (гвард превращает null в 401). */
  async findById(id: string): Promise<UserLean | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await this.model.findById(id).lean<UserDoc>();
    return doc ? toLean(doc) : null;
  }

  async findByTelegramId(telegramId: number): Promise<UserLean | null> {
    const doc = await this.model.findOne({ telegramId }).lean<UserDoc>();
    return doc ? toLean(doc) : null;
  }

  /** Учителя, помощники учителя и админы с подключённым Telegram — кому бот
   * вообще может писать (TeacherChats, api/src/telegram/teacher-chats.ts,
   * PLAN.md §6): помощник учителя правами равен учителю, поэтому в списке —
   * дальше TeacherChats сверяет каждого с активным личным каналом. Бухгалтер
   * и ученик сюда не попадают — бот с ними проактивно не говорит. */
  async listTeacherContacts(): Promise<
    { id: string; name: string; telegramId: number }[]
  > {
    const docs = await this.model
      .find(
        {
          telegramId: { $exists: true },
          roles: { $in: ['teacher', 'assistant', 'admin'] },
        },
        { name: 1, telegramId: 1 },
      )
      // Список внутренний (TeacherChats), но без лимита — «дай всё» тем же
      // запрещённым приёмом, что и у публичных списков (CLAUDE.md «API»).
      .limit(LIST_LIMIT_DEFAULT)
      .lean<{ _id: Types.ObjectId; name: string; telegramId: number }[]>();
    return docs.map((doc) => ({
      id: doc._id.toString(),
      name: doc.name,
      telegramId: doc.telegramId,
    }));
  }

  /** Для бота (вход через Telegram, «Ученик появляется … после входа»,
   * SECURITY §2): роли по умолчанию пустые ([] — гость), админ назначает их
   * в интерфейсе.
   *
   * Атомарный upsert по уникальному индексу telegramId, а не findOne+create:
   * два параллельных первых входа (двойной клик, два тика вебхука) иначе
   * создают двух пользователей до того, как первый успеет записаться.
   * `$setOnInsert` — роли и остальные поля пишутся только при вставке:
   * повторный вход существующего пользователя их не трогает. */
  async createFromTelegram(input: {
    telegramId: number;
    name: string;
    roles: UserRole[];
  }): Promise<UserLean> {
    const doc =
      (await this.upsertByTelegramId(input)) ??
      (await this.findByTelegramId(input.telegramId));
    if (!doc) {
      // upsert либо вернул документ, либо упал на дубликате — и тогда конкурент
      // его уже записал; пустой ответ здесь означает сбой базы, не гонку.
      throw new Error('createFromTelegram: пользователь не найден после upsert');
    }
    return doc;
  }

  /** null — только если upsert упал на E11000: Mongo повторяет upsert при
   * гонке по уникальному индексу не всегда (частичный индекс telegramId),
   * и без этой ветки второй из двух одновременных первых входов получал 500.
   * Вызывающий код перечитывает документ, который записал конкурент. */
  private async upsertByTelegramId(input: {
    telegramId: number;
    name: string;
    roles: UserRole[];
  }): Promise<UserLean | null> {
    try {
      const doc = await this.model
        .findOneAndUpdate(
          { telegramId: input.telegramId },
          {
            $setOnInsert: {
              telegramId: input.telegramId,
              name: input.name,
              roles: input.roles,
              tz: SCHOOL_TZ,
              status: 'active',
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .lean<UserDoc>();
      return doc ? toLean(doc) : null;
    } catch (err) {
      if (isDuplicateKeyError(err)) return null;
      throw err;
    }
  }

  /** Время — параметром (CLAUDE.md «Время»): вызывающий код решает, что
   * считать «сейчас», сервис не трогает Date.now()/DateTime.utc() сам. */
  async touchLogin(id: string, now: DateTime): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: now.toJSDate() } });
  }
}
