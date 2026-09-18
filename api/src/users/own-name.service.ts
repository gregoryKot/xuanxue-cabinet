// Смена собственного имени — `PATCH /me/profile`: вход по почте заводит
// name, равным самой почте (email-login-user.service.ts), и до этого
// сервиса поправить это было нечем — учитель видел на карточке проверки
// заголовок вида `doctor.martynova@gmail.com`. Отдельный файл, не метод в
// UsersService: тот уже на пределе файла-храповика (CLAUDE.md «Храповики»,
// тот же приём, что у UserStatusService/UserNamesService).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { USER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class OwnNameService {
  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /** Меняет имя ТОЛЬКО себе: `userId` приходит из сессии (@CurrentUser в
   * контроллере), не из тела запроса — иначе один человек мог бы
   * переименовать другого (SECURITY §2, whitelist в DTO отбрасывает чужой id). */
  async renameSelf(userId: string, name: string): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);

    const doc = await this.model
      .findOneAndUpdate({ _id: userId }, { $set: { name } }, { returnDocument: 'after' })
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    return toLean(doc);
  }
}
