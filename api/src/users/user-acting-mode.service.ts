// Человек включает или выключает себе режим (PUT /me/student-mode — ADR-0163,
// PUT /me/teacher-mode — ADR-0190). Один сервис на оба режима: различаются они
// только полем, тем, кто вправе включить, текстом отказа и соседним режимом,
// который включение снимает, — всё это строка таблицы MODES, а не вторая копия
// кода. Отдельный файл, не метод в UsersService: тот на пределе файла-храповика
// (тот же приём, что у UserNoTelegramService).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Model } from 'mongoose';
import {
  isStaffRole,
  STUDENT_MODE_STAFF_ONLY_MESSAGE,
  TEACHER_MODE_ADMIN_ONLY_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  type UserRole,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import type { ActingModeKey } from './acting-mode';
import { UserRecord } from './user.schema';
import { toLean, type UserDoc, type UserLean } from './users.service';

type ModeField = 'studentModeAt' | 'teacherModeAt';

interface ModeSpec {
  /** Поле документа, в котором лежит момент включения. */
  field: ModeField;
  /** Соседний режим: включение этого снимает его тем же апдейтом (режимы
   * взаимоисключающие — у человека действует одна маска ролей, не две). */
  other: ModeField;
  /** Вправе ли включить — по НАСТОЯЩИМ ролям из БД. */
  canEnable: (roles: readonly UserRole[]) => boolean;
  forbiddenMessage: string;
  /** Для строки лога. */
  logLabel: string;
}

const MODES: Record<ActingModeKey, ModeSpec> = {
  student: {
    field: 'studentModeAt',
    other: 'teacherModeAt',
    canEnable: isStaffRole,
    forbiddenMessage: STUDENT_MODE_STAFF_ONLY_MESSAGE,
    logLabel: 'режим ученика',
  },
  teacher: {
    field: 'teacherModeAt',
    other: 'studentModeAt',
    canEnable: (roles) => roles.includes('admin'),
    forbiddenMessage: TEACHER_MODE_ADMIN_ONLY_MESSAGE,
    logLabel: 'режим учителя',
  },
};

@Injectable()
export class UserActingModeService {
  private readonly logger = new Logger(UserActingModeService.name);

  constructor(@InjectModel(UserRecord.name) private readonly model: Model<UserRecord>) {}

  /**
   * Ставит или снимает момент режима (`studentModeAt` / `teacherModeAt`).
   * Возвращает человека из БД — с НАСТОЯЩИМИ ролями: маску на ответ накладывает
   * `toMeDto` (acting-mode.ts).
   *
   * Включить — только при настоящей роли, которую читаем из БД заново, а не берём
   * из сессии: сессия в режиме видит маску (`[]` или `['teacher']`) и по ней
   * штат от ученика и админа от учителя не отличить (SECURITY §2, ADR-0163,
   * ADR-0190). Выключить — всегда, без проверки ролей: человек в режиме не пройдёт
   * ни один маршрут прежней роли, и выход обязан остаться. Между проверкой роли и
   * записью роли могут успеть снять — тогда флаг застрянет без роли, и `toLean` его
   * не засчитает (`isStudentModeOn`/`isTeacherModeOn`): режим только убавляет права,
   * вреда нет.
   *
   * Повторное включение первый момент не затирает (фильтр `$exists: false`):
   * повтор после ретрая ничего не меняет. Включение одного режима в том же апдейте
   * снимает соседний. `$unset`, а не запись `null` — см. комментарий у поля в
   * схеме. Время — параметром (CLAUDE.md «Время»). `id` приходит из сессии,
   * поэтому и невалидный id, и удалённый аккаунт — оба NotFoundError, как у
   * UserNoTelegramService.
   */
  async setMode(
    mode: ActingModeKey,
    userId: string,
    enabled: boolean,
    now: DateTime,
  ): Promise<UserLean> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    const spec = MODES[mode];
    const doc = enabled
      ? await this.enable(spec, userId, now)
      : await this.disable(spec, userId);
    // Только id: имя и контакты в лог не идут (CLAUDE.md «Логи»).
    this.logger.log(`${spec.logLabel} ${enabled ? 'включён' : 'выключен'}: ${userId}`);
    return toLean(doc);
  }

  private async enable(spec: ModeSpec, userId: string, now: DateTime): Promise<UserDoc> {
    const current = await this.model.findById(userId).lean<UserDoc>();
    if (!current) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    if (!spec.canEnable(current.roles)) throw new ForbiddenError(spec.forbiddenMessage);

    const updated = await this.model
      .findOneAndUpdate(
        { _id: userId, [spec.field]: { $exists: false } },
        { $set: { [spec.field]: now.toJSDate() }, $unset: { [spec.other]: 1 } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    // null — режим уже включён (фильтр не нашёл документ без флага): отвечаем
    // тем, что прочитали.
    return updated ?? current;
  }

  private async disable(spec: ModeSpec, userId: string): Promise<UserDoc> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: userId },
        { $unset: { [spec.field]: 1 } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    return doc;
  }
}
