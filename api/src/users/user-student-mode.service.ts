// Сотрудник школы включает или выключает себе режим ученика (ADR-0163,
// PUT /me/student-mode). Отдельный файл, не метод в UsersService: тот на пределе
// файла-храповика (тот же приём, что у UserNoTelegramService).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  isStaffRole,
  STUDENT_MODE_STAFF_ONLY_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserStudentModeService {
  private readonly logger = new Logger(UserStudentModeService.name);

  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /**
   * Ставит или снимает `studentModeAt`. Возвращает человека из БД — с НАСТОЯЩИМИ
   * ролями: маску на ответ накладывает `toMeDto` (student-mode.ts).
   *
   * Включить — только при настоящей роли штата, которую читаем из БД заново, а не
   * берём из сессии: сессия в режиме ученика видит `roles: []` и по ней штат не
   * отличить от ученика (SECURITY §2, ADR-0163). Выключить — всегда, без проверки
   * ролей: человек в режиме не пройдёт ни один штатный маршрут, и выход обязан
   * остаться. Между проверкой роли и записью роли могут успеть снять — тогда
   * флаг застрянет без штата, и `toLean` его не засчитает (`isStudentModeOn`):
   * режим только убавляет права, вреда нет.
   *
   * Повторное включение первый момент не затирает (фильтр `$exists: false`):
   * повтор после ретрая ничего не меняет. `$unset`, а не запись `null` — см.
   * комментарий у поля в схеме. Время — параметром (CLAUDE.md «Время»).
   * `id` приходит из сессии, поэтому и невалидный id, и удалённый аккаунт — оба
   * NotFoundError, как у UserNoTelegramService.
   */
  async setStudentMode(
    userId: string,
    enabled: boolean,
    now: DateTime,
  ): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    const doc = enabled ? await this.enable(userId, now) : await this.disable(userId);
    // Только id: имя и контакты в лог не идут (CLAUDE.md «Логи»).
    this.logger.log(`режим ученика ${enabled ? 'включён' : 'выключен'}: ${userId}`);
    return toLean(doc);
  }

  private async enable(userId: string, now: DateTime): Promise<UserDoc> {
    const current = await this.model.findById(userId).lean<UserDoc>();
    if (!current) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    if (!isStaffRole(current.roles)) {
      throw new ForbiddenError(STUDENT_MODE_STAFF_ONLY_MESSAGE);
    }

    const updated = await this.model
      .findOneAndUpdate(
        { _id: userId, studentModeAt: { $exists: false } },
        { $set: { studentModeAt: now.toJSDate() } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    // null — режим уже включён (фильтр не нашёл документ без флага): отвечаем
    // тем, что прочитали.
    return updated ?? current;
  }

  private async disable(userId: string): Promise<UserDoc> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: userId },
        { $unset: { studentModeAt: 1 } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    return doc;
  }
}
