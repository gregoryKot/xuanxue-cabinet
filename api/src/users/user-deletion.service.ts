// Удаление всех данных пользователя (CLAUDE.md «Персональные данные
// учеников», аудит В11): CLAUDE.md и user.schema.ts годами ссылались на
// deleteAllUserData как на работающий механизм, а его не было —
// USER_REFERENCE_PATHS до этого никем не читался. Порядок: (а) владение
// (USER_OWNED_COLLECTIONS — с появлением попыток экзамена он перестал быть
// пустым; чеклист «Новая коллекция с userId» подхватывает новую модель сам,
// без правки этого файла) — deleteMany; (б)
// ссылки на пользователя (USER_REFERENCE_PATHS) — $unset, не удаление
// документа: класс/занятие/канал/рассылка принадлежат школе, не пользователю
// (ADR-0010), удалённый ведущий не должен утащить их за собой; (в) состояние
// бота bot_sessions — ключ там chatId, у личных чатов учителя это
// String(telegramId) (personal-chats.ts), а не userId; (г) сам документ
// users. Сессия кабинета — не хранимое состояние (ADR-0012: HMAC-JWT без
// Mongo-стора, «сессии не нужно ни отзывать по одной, ни хранить») —
// AuthGuard на каждом запросе перечитывает пользователя
// (UsersService.findById) и без документа сам отдаёт 401, отдельной
// коллекции сессий в проекте нет.
//
// Модели коллекций реестра берём через connection.model(name) (InjectConnection),
// а не через DI по классу: тогда новая модель из USER_OWNED_COLLECTIONS
// подключается без правки конструктора этого сервиса.
import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import {
  LAST_ADMIN_MESSAGE,
  SELF_DELETE_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { BotSessionRecord } from '../telegram/bot-session.schema';
import { isLastAdmin, rollbackIfNoAdminLeft } from './last-admin';
import {
  USER_MODEL_NAME,
  USER_OWNED_CASCADES,
  USER_OWNED_COLLECTIONS,
  USER_REFERENCE_PATHS,
} from './user-data.registry';
import type { UserRecord } from './user.schema';
import { UsersService } from './users.service';

/** Документ произвольной коллекции реестра — поля читаются по динамическому
 * имени (`userId` у владения, путь ссылки у $unset), собственного схемного
 * типа здесь не требуется. */
type GenericRecord = Record<string, unknown>;

@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly usersService: UsersService,
  ) {}

  async deleteAllUserData(userId: string, currentUserId: string): Promise<void> {
    assertObjectId(userId, USER_NOT_FOUND_MESSAGE);
    const target = await this.usersService.findById(userId);
    if (!target) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    if (userId === currentUserId) throw new ForbiddenError(SELF_DELETE_MESSAGE);

    if (target.roles.includes('admin')) {
      const userModel = this.connection.model<UserRecord>(USER_MODEL_NAME);
      if (await isLastAdmin(userModel, userId)) {
        throw new ForbiddenError(LAST_ADMIN_MESSAGE);
      }
      // Удаление необратимо — в отличие от updateRoles здесь нельзя откатить
      // уже случившийся факт удаления данных, поэтому резервируем место в
      // счётчике условным апдейтом ДО необратимой части: снимаем admin с
      // удаляемого, как будто роль уже потеряна. Конкурирующая операция
      // (второй админ, снимающий роль или удаляющий сам себя таким же
      // образом) сделает то же самое со своей стороны; rollbackIfNoAdminLeft
      // сразу же пересчитывает admin'ов и, если их не осталось, возвращает
      // роль этому пользователю тем же условным апдейтом и отказывает — тело
      // метода до удаления данных ниже не доходит (аудит M11, last-admin.ts).
      await userModel.updateOne(
        { _id: userId, roles: 'admin' },
        { $pull: { roles: 'admin' } },
      );
      await rollbackIfNoAdminLeft(userModel, () =>
        userModel.updateOne({ _id: userId }, { $addToSet: { roles: 'admin' } }),
      );
    }

    // Счётчики по каждой части реестра — в лог идёт только userId и числа
    // (CLAUDE.md «Логи»: PII туда не попадает, ни имя, ни email, ни telegramId).
    const removed: Record<string, number> = {};

    // Каскады — ДО удаления самих документов владения: ссылки на байты
    // живут в них (`payments.screenshotImageId`, ADR-0050), и после
    // deleteMany ниже искать снимок было бы уже нечем.
    for (const { from, path, model } of USER_OWNED_CASCADES) {
      const ids = await this.connection
        .model<GenericRecord>(from)
        .distinct(path, { userId });
      const res = await this.connection
        .model<GenericRecord>(model)
        .deleteMany({ _id: { $in: ids } });
      removed[model] = res.deletedCount;
    }

    for (const name of USER_OWNED_COLLECTIONS) {
      const res = await this.connection.model<GenericRecord>(name).deleteMany({ userId });
      removed[name] = res.deletedCount;
    }

    for (const { model, path } of USER_REFERENCE_PATHS) {
      const res = await this.connection
        .model<GenericRecord>(model)
        .updateMany({ [path]: userId }, { $unset: { [path]: 1 } });
      removed[`${model}.${path}`] = res.modifiedCount;
    }

    if (target.telegramId !== undefined) {
      const res = await this.connection
        .model<{ chatId: number }>(BotSessionRecord.name)
        .deleteMany({ chatId: target.telegramId });
      removed[BotSessionRecord.name] = res.deletedCount;
    }

    await this.connection.model<UserRecord>(USER_MODEL_NAME).deleteOne({ _id: userId });

    this.logger.log({ userId, removed });
  }
}
