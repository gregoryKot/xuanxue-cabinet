// Первый вход — человек называет себя сам (ADR-0044, экран `/welcome`,
// PATCH /me/profile). Отдельный файл, не метод в UsersService: тот уже на
// пределе файла-храповика (CLAUDE.md «Храповики», тот же приём, что у
// UserNamesService/EmailLoginUserService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import { joinPersonName, USER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserProfileService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /**
   * `name` — склейка имени/фамилии (joinPersonName: пустая фамилия исчезает
   * вместе с пробелом-разделителем, ADR-0044), `profileNamedAt` — момент,
   * после которого `/welcome` не откроется снова (MeDto.needsProfile,
   * миграция 0009 для тех, кто вошёл раньше). Время — параметром (CLAUDE.md
   * «Время»), сервис не трогает DateTime.utc()/Date.now() сам.
   *
   * Невалидный ObjectId и отсутствующий пользователь — оба NotFoundError:
   * `id` приходит из сессии (@CurrentUser()), поэтому это не пользовательская
   * ошибка ввода, но и не повод падать 500, если аккаунт успели удалить
   * между выдачей сессии и этим запросом. USER_NOT_FOUND_MESSAGE — тот же
   * текст, что и у UserStatusService.updateStatus для «пользователя по id
   * нет» (CLAUDE.md «Одна механика — один компонент»).
   */
  async setName(
    userId: string,
    input: { firstName: string; lastName?: string },
    now: DateTime,
  ): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);

    const doc = await this.model
      .findOneAndUpdate(
        { _id: userId },
        {
          $set: {
            name: joinPersonName(input.firstName, input.lastName),
            profileNamedAt: now.toJSDate(),
          },
        },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    return toLean(doc);
  }
}
