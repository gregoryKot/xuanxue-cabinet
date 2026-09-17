// Блокировка/открытие доступа на экране «Люди» (ADR-0034, миграция 0007,
// RUNBOOK §8.15: обещание «лишних админ заблокирует на «Людях»» до этого
// сервиса не имело ни кнопки, ни API). Отдельно от user-roles.service.ts —
// своя пара ограничений (себе, последнему активному админу) и без
// перепроверки после записи (last-active-admin.ts объясняет, почему).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LAST_ADMIN_BLOCK_MESSAGE,
  SELF_BLOCK_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  type UserStatus,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { isLastActiveAdmin } from './last-active-admin';
import { UserRecord } from './user.schema';
import { toLean, UsersService, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserStatusService {
  constructor(
    @InjectModel(UserRecord.name) private readonly model: Model<UserRecord>,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Открыть доступ (`active`) можно любому, включая себя, — идемпотентно.
   * Закрыть (`blocked`) нельзя себе (некому будет открыть обратно) и
   * последнему активному администратору школы (иначе открывать доступ
   * обратно станет некому).
   */
  async updateStatus(
    id: string,
    status: UserStatus,
    currentUserId: string,
  ): Promise<UserLean> {
    assertObjectId(id, USER_NOT_FOUND_MESSAGE);
    const target = await this.usersService.findById(id);
    if (!target) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    if (status === 'blocked') {
      if (id === currentUserId) throw new ForbiddenError(SELF_BLOCK_MESSAGE);
      if (target.roles.includes('admin') && (await isLastActiveAdmin(this.model, id))) {
        throw new ForbiddenError(LAST_ADMIN_BLOCK_MESSAGE);
      }
    }

    const doc = await this.model
      .findOneAndUpdate({ _id: id }, { $set: { status } }, { returnDocument: 'after' })
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    return toLean(doc);
  }
}
