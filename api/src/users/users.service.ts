// Единственная точка чтения/записи UserRecord — CRUD с типизированным
// возвратом; вход — в api/src/auth/, список и роли — в user-roles.service.ts.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model, Types } from 'mongoose';
import type { UserRole, UserStatus } from '@xuanxue/shared';
import { UserRecord } from './user.schema';
import {
  listActiveWithRoles as listActiveWithRolesQuery,
  type ActiveRoledUser,
} from './list-active-with-roles';
import {
  listContactsWithRoles as listContactsWithRolesQuery,
  type RoledContact,
} from './list-contacts-with-roles';
import { attachTelegramId as attachTelegramIdWrite } from './attach-telegram-id';
import { markJoinedViaInvite as markJoinedViaInviteWrite } from './mark-joined-via-invite';
import { normalizeUserStatus } from './normalize-user-status';
import { upsertUserByKey } from './upsert-user-by-key';

/** Внутреннее представление пользователя — шире MeDto: гварду нужны status и
 * roles, а не только то, что видит интерфейс (toMeDto в auth/to-me.dto.ts). */
export interface UserLean {
  id: string;
  name: string;
  email?: string;
  pendingEmail?: string;
  telegramId?: number;
  googleId?: string;
  roles: UserRole[];
  status: UserStatus;
  lastLoginAt?: Date;
  joinedViaInviteAt?: Date;
  profileNamedAt?: Date;
}

export type UserDoc = UserRecord & { _id: Types.ObjectId };

/** Что известно о человеке в момент первого входа через Telegram. */
export interface NewTelegramUser {
  telegramId: number;
  name: string;
  roles: UserRole[];
  status: UserStatus;
}

/** Экспортирован для user-roles.service.ts — тот же маппер, не вторая реализация.
 * status — через normalizeUserStatus.ts (expand→contract после миграции 0007,
 * ADR-0036): единственный маппер документа в UserLean покрывает этим все чтения. */
export function toLean(doc: UserDoc): UserLean {
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    pendingEmail: doc.pendingEmail,
    telegramId: doc.telegramId,
    googleId: doc.googleId,
    roles: doc.roles,
    status: normalizeUserStatus(doc.status, doc._id.toString()),
    lastLoginAt: doc.lastLoginAt,
    joinedViaInviteAt: doc.joinedViaInviteAt,
    profileNamedAt: doc.profileNamedAt,
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

  /** Логика — в list-contacts-with-roles.ts (та же причина выноса, что у
   * upsert-user-by-key.ts). Роли — параметром: list() зовёт со штатом,
   * listFor(kind) — с ролями вида (см. комментарий там же и в personal-chats.ts). */
  async listContactsWithRoles(roles: readonly UserRole[]): Promise<RoledContact[]> {
    return listContactsWithRolesQuery(this.model, roles);
  }

  /** Активные люди с такими ролями — кандидаты записи кабинета
   * (InAppExamNotifier, ADR-0061), без требования канала связи (в отличие
   * от listContactsWithRoles). Логика — в list-active-with-roles.ts (та же
   * причина выноса, что у upsert-user-by-key.ts). */
  async listActiveWithRoles(roles: readonly UserRole[]): Promise<ActiveRoledUser[]> {
    return listActiveWithRolesQuery(this.model, roles);
  }

  /** Первый вход через Telegram (SECURITY §2, ADR-0030/0036): всегда
   * `active` — без ссылки-приглашения (или для бутстрап-админа) регистрация
   * не доходит до этого метода вовсе, `LoginIdentityService` решает это
   * раньше (login-identity.service.ts).
   *
   * Атомарный upsert по уникальному индексу telegramId, а не findOne+create:
   * два параллельных первых входа (двойной клик, два тика вебхука) иначе
   * создают двух пользователей до того, как первый успеет записаться.
   * `$setOnInsert` — роли и остальные поля пишутся только при вставке:
   * повторный вход существующего пользователя их не трогает. */
  async createFromTelegram(input: NewTelegramUser): Promise<UserLean> {
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
   * Вызывающий код перечитывает документ, который записал конкурент.
   * Сам upsert — общий приём с email-входом, см. upsert-user-by-key.ts. */
  private async upsertByTelegramId(input: NewTelegramUser): Promise<UserLean | null> {
    const doc = await upsertUserByKey<UserDoc>(
      this.model,
      { telegramId: input.telegramId },
      {
        telegramId: input.telegramId,
        name: input.name,
        roles: input.roles,
        status: input.status,
      },
    );
    return doc ? toLean(doc) : null;
  }

  /** Время — параметром (CLAUDE.md «Время»): вызывающий код решает, что
   * считать «сейчас», сервис не трогает Date.now()/DateTime.utc() сам. */
  async touchLogin(id: string, now: DateTime): Promise<void> {
    await this.model.updateOne({ _id: id }, { $set: { lastLoginAt: now.toJSDate() } });
  }

  /** Логика — в mark-joined-via-invite.ts (та же причина выноса, что у
   * upsert-user-by-key.ts: файл не растёт за 150 строк). */
  async markJoinedViaInvite(id: string, now: DateTime): Promise<void> {
    await markJoinedViaInviteWrite(this.model, id, now);
  }

  /** Ставит telegramId на аккаунт, у которого его ещё нет (ADR-0034,
   * TelegramLinkService) — `null`, если гонку выиграл кто-то другой. Логика
   * — в attach-telegram-id.ts (та же причина выноса, что у
   * markJoinedViaInvite). */
  async attachTelegramId(userId: string, telegramId: number): Promise<UserLean | null> {
    return attachTelegramIdWrite(this.model, userId, telegramId);
  }
}
