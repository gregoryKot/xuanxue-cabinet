// Единственная точка чтения/записи UserRecord. Сам вход (проверка виджета,
// выпуск сессии) — в api/src/auth/ (вход через Telegram добавит вызовы
// createFromTelegram и findByTelegramId из /auth/telegram); этот сервис —
// только CRUD с типизированным возвратом (правило CLAUDE.md: контроллер/
// гвард не лезут в Mongoose напрямую).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { UserRole, UserStatus } from '@xuanxue/shared';
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

type UserDoc = UserRecord & { _id: Types.ObjectId };

function toLean(doc: UserDoc): UserLean {
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

  /** Для бота (вход через Telegram, «Ученик появляется … после входа»,
   * SECURITY §2): роли по умолчанию пустые ([] — гость), админ назначает их
   * в интерфейсе. */
  async createFromTelegram(input: {
    telegramId: number;
    name: string;
    roles: UserRole[];
  }): Promise<UserLean> {
    const created = await this.model.create(input);
    return toLean(created);
  }

  /** Время — параметром (CLAUDE.md «Время»): вызывающий код решает, что
   * считать «сейчас», сервис не трогает Date.now()/DateTime.utc() сам. */
  async touchLogin(id: string, now: DateTime): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: now.toJSDate() } });
  }
}
