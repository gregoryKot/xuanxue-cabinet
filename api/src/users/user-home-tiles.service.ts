// Человек выбирает, какие плитки «Главной» ему не нужны (ADR-0179,
// PUT /me/home-tiles). Отдельный файл, не метод в UsersService: тот на пределе
// файла-храповика (тот же приём, что у UserStudentModeService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  normalizeHomeHiddenTiles,
  USER_NOT_FOUND_MESSAGE,
  type HomeTileKey,
} from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserHomeTilesService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /**
   * Записывает полный список скрытых плиток человека и возвращает его из БД.
   * Список приходит целиком, а не «переключить одну»: повтор запроса даёт то же
   * самое, два устройства не расходятся. Повторы и порядок схлопывает
   * `normalizeHomeHiddenTiles`, поэтому в базе всегда канонический вид. Пустой
   * список — `$unset`, а не `[]`: «поля нет» читается однозначно как «скрытого
   * нет» (тот же приём, что у `studentModeAt` и `noTelegramAt`).
   *
   * `id` приходит из сессии (@CurrentUser()), поэтому и невалидный id, и
   * удалённый между выдачей сессии и запросом аккаунт — NotFoundError, а не 500.
   */
  async setHidden(userId: string, hidden: readonly HomeTileKey[]): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    const normalized = normalizeHomeHiddenTiles(hidden);

    const doc = await this.model
      .findOneAndUpdate(
        { _id: userId },
        normalized.length > 0
          ? { $set: { homeHiddenTiles: normalized } }
          : { $unset: { homeHiddenTiles: 1 } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    return toLean(doc);
  }
}
