// Список и назначение ролей для экрана «Люди» (docs/PLAN.md §6, блокер
// аудита Б3: до этого экрана вторую роль назначали правкой Atlas руками).
// Отдельно от users.service.ts — тот уже был на пределе файла-храповика
// (CLAUDE.md «Храповики»: 150 строк), это не тот же CRUD, что там (создание
// из Telegram, поиск сессии), а отдельная механика с двумя ограничениями.
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LIST_LIMIT_DEFAULT,
  LAST_ADMIN_MESSAGE,
  SELF_DEMOTE_MESSAGE,
  USER_NOT_FOUND_MESSAGE,
  type ListUsersQuery,
  type UserRole,
} from '@xuanxue/shared';
import { ForbiddenError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
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
   * Назначение ролей — единственная мутация из UsersController (SECURITY §2:
   * роли меняются только в интерфейсе админом, не из клиентского body любого
   * другого маршрута). Два ограничения защищают школу от «остаться без
   * доступа»: нельзя снять admin у самого себя (currentUserId, проверка не
   * зависит от гонки — id и так неизменны) и нельзя снять admin у последнего
   * администратора в базе (isLastAdmin, комментарий там же про гонку).
   * Апдейт условный по `roles` из уже прочитанного `target`: если роли
   * поменялись между чтением и записью (двойной клик, второй админ успел
   * раньше), `findOneAndUpdate` не находит документ, и вызывающий получает
   * понятный NotFoundError вместо тихой перезаписи чужого решения.
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
      if (await this.isLastAdmin(id)) throw new ForbiddenError(LAST_ADMIN_MESSAGE);
    }

    const doc = await this.model
      .findOneAndUpdate(
        { _id: id, roles: target.roles },
        { $set: { roles } },
        { returnDocument: 'after' },
      )
      .lean<UserDoc>();
    if (!doc) throw new NotFoundError(USER_NOT_FOUND_MESSAGE);
    return toLean(doc);
  }

  /** Считает других админов, не общее число admin: `id` у нас уже с ролью
   * admin (проверено в updateRoles до вызова) — интересует, остаётся ли
   * школа хоть с одним, если снять её здесь. Не защищает от гонки, когда
   * два админа снимают роль друг у друга в один момент (оба видят «есть
   * ещё один» и проходят проверку) — школа маленькая, действие редкое,
   * полноценная блокировка (транзакция) для этого случая не стоит своей
   * сложности сейчас; если вырастет — усилить, как markSent в deliveries. */
  private async isLastAdmin(id: string): Promise<boolean> {
    const otherAdmins = await this.model.countDocuments({
      _id: { $ne: id },
      roles: 'admin',
    });
    return otherAdmins === 0;
  }
}
