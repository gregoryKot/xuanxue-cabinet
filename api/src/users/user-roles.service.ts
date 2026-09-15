// Список, назначение ролей и подтверждение человека для экрана «Ученики»
// (docs/PLAN.md §6, блокер аудита Б3: до этого экрана вторую роль назначали
// правкой Atlas руками; подтверждение — ADR-0026).
// Отдельно от users.service.ts — тот уже был на пределе файла-храповика
// (CLAUDE.md «Храповики»: 150 строк), это не тот же CRUD, что там (создание
// из Telegram, поиск сессии), а отдельная механика с двумя ограничениями.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  ALREADY_BLOCKED_MESSAGE,
  LAST_ADMIN_MESSAGE,
  SELF_DEMOTE_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  type ListUsersQuery,
  type UserRole,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { isLastAdmin, rollbackIfNoAdminLeft } from './last-admin';
import { UserRecord } from './user.schema';
import { toLean, UsersService, type UserDoc, type UserLean } from './users.service';

@Injectable()
export class UserRolesService {
  constructor(
    @InjectModel(UserRecord.name) private readonly model: Model<UserRecord>,
    private readonly usersService: UsersService,
  ) {}

  /** Последние вошедшие сверху — тот, кто входил недавно, скорее всего
   * пришёл за ролью. */
  async list(query: ListUsersQuery): Promise<UserLean[]> {
    const docs = await this.model
      .find({})
      .sort({ lastLoginAt: -1 })
      .limit(query.limit ?? LIST_LIMIT_DEFAULT)
      .lean<UserDoc[]>();
    return docs.map(toLean);
  }

  /**
   * Подтверждение человека школой (ADR-0026): `invited` → `active`, после
   * чего он видит расписание, экзамены и уведомления. Идемпотентно —
   * второе нажатие (двойной клик, два админа сразу) возвращает того же
   * человека, а не ошибку. Заблокированного подтверждение не воскрешает:
   * `blocked` снимается осознанно, отдельным решением, а не кнопкой
   * «Подтвердить» в общем списке.
   */
  async approve(id: string): Promise<UserLean> {
    assertObjectId(id, USER_NOT_FOUND_MESSAGE);
    const target = await this.usersService.findById(id);
    if (!target) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    if (target.status === 'blocked') throw new ForbiddenError(ALREADY_BLOCKED_MESSAGE);
    if (target.status === 'active') return target;

    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, status: 'invited' },
        { $set: { status: 'active' } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    // Документа нет — статус успел поменяться между чтением и записью;
    // перечитываем, чтобы вернуть правду, а не 404 на живого человека.
    if (!doc) return (await this.usersService.findById(id)) ?? target;
    return toLean(doc);
  }

  /**
   * Назначение ролей — единственная мутация из UsersController (SECURITY §2:
   * роли меняются только в интерфейсе админом, не из клиентского body любого
   * другого маршрута). Два ограничения защищают школу от «остаться без
   * доступа»: нельзя снять admin у самого себя (currentUserId, проверка не
   * зависит от гонки — id и так неизменны) и нельзя снять admin у последнего
   * администратора в базе. Апдейт условный по `roles` из уже прочитанного
   * `target`: если роли поменялись между чтением и записью (двойной клик,
   * второй админ успел раньше), `findOneAndUpdate` не находит документ, и
   * вызывающий получает понятный NotFoundError вместо тихой перезаписи чужого
   * решения. `isLastAdmin` — дешёвая проверка до записи; `rollbackIfNoAdminLeft`
   * после уже применённой записи закрывает гонку между двумя такими проверками
   * (last-admin.ts, аудит M11) — общая с UserDeletionService.deleteAllUserData.
   */
  async updateRoles(
    id: string,
    roles: UserRole[],
    currentUserId: string,
  ): Promise<UserLean> {
    assertObjectId(id, USER_NOT_FOUND_MESSAGE);
    const target = await this.usersService.findById(id);
    if (!target) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    const losesAdmin = target.roles.includes('admin') && !roles.includes('admin');
    if (losesAdmin) {
      if (id === currentUserId) throw new ForbiddenError(SELF_DEMOTE_MESSAGE);
      if (await isLastAdmin(this.model, id)) throw new ForbiddenError(LAST_ADMIN_MESSAGE);
    }

    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, roles: target.roles },
        { $set: { roles } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);

    if (losesAdmin) {
      await rollbackIfNoAdminLeft(this.model, () =>
        this.model.updateOne({ _id: id, roles }, { $addToSet: { roles: 'admin' } }),
      );
    }

    return toLean(doc);
  }
}
