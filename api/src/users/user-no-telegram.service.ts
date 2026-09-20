// Человек сказал, что Telegram у него нет, или отозвал это (ADR-0067,
// PUT /me/no-telegram). Отдельный файл, не метод в UsersService: тот уже на
// пределе файла-храповика (CLAUDE.md «Храповики», тот же приём, что у
// UserProfileService/UserNamesService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { USER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserNoTelegramService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /**
   * Ставит или снимает `noTelegramAt` (ADR-0067) — отметка «не предлагать
   * связку», а не «не слать»: без личного чата с ботом
   * `PersonalChats.chatFor()` и так отдаёт `null`, доставки не будет что с
   * этим полем, что без него, строить на нём логику планировщика нельзя.
   *
   * Повторный вызов с `true` просто обновляет момент — отметка та же самая,
   * идемпотентность держится на `$set`/`$unset` по `_id`, а не на флаге в
   * памяти. `$unset`, а не запись `null`: маппер читает `noTelegramAt !=
   * null` (auth/user.mapper.ts), и «поля нет» обязано читаться однозначно
   * как «отметки нет», без второго falsy-значения на тот же смысл. Время —
   * параметром (CLAUDE.md «Время»), сервис не трогает
   * DateTime.utc()/Date.now() сам.
   *
   * Невалидный ObjectId и отсутствующий пользователь — оба NotFoundError, та
   * же причина, что у UserProfileService.setName: `id` приходит из сессии
   * (@CurrentUser()), а не от пользователя, поэтому не 400 и не повод падать
   * 500, если аккаунт успели удалить между выдачей сессии и этим запросом.
   */
  async setNoTelegram(
    userId: string,
    noTelegram: boolean,
    now: DateTime,
  ): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);

    const doc = await this.model
      .findOneAndUpdate(
        { _id: userId },
        noTelegram
          ? { $set: { noTelegramAt: now.toJSDate() } }
          : { $unset: { noTelegramAt: 1 } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    return toLean(doc);
  }
}
