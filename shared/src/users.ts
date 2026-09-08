// DTO и константы для `/users` — экран «Люди» (docs/PLAN.md §6, блокер
// аудита Б3): список тех, кто хоть раз вошёл через Telegram, и назначение
// ролей учитель/админ. Общий контракт api и web (CLAUDE.md «Слои»): DTO в
// api объявляется как `implements` этих типов, расхождение ловит tsc.
import type { UserRole, UserStatus } from './auth';

/**
 * Строка списка `/users` для интерфейса — без ПДн (SECURITY §1): ни
 * `telegramId`, ни `email`, ни `googleId` сюда не входят, только то, что
 * можно показать на экране «Люди» (user.mapper.ts).
 */
export interface UserDto {
  id: string;
  name: string;
  roles: UserRole[];
  status: UserStatus;
  /** Вошёл через Telegram-виджет — сейчас единственный путь входа, но поле
   * не называется `telegramId`, чтобы не тянуть за собой сам идентификатор. */
  hasTelegram: boolean;
  lastLoginAt?: string;
}

export interface ListUsersQuery {
  limit?: number;
}

/** Тело `PATCH /users/:id` — полный список ролей, не добавление/снятие по
 * одной: интерфейс шлёт состояние двух переключателей целиком (проще и без
 * гонки между «включить учителя» и «выключить админа» отдельными запросами). */
export interface UpdateUserRolesInput {
  roles: UserRole[];
}

export const USER_NOT_FOUND_MESSAGE = 'Пользователь не найден. Обновите список.';

/** Нельзя снять роль администратора у самого себя (UserRolesService.updateRoles) —
 * без этого админ может остаться без доступа в одно действие. */
export const SELF_DEMOTE_MESSAGE =
  'Чтобы вы не остались без доступа, роль администратора у себя снимает другой администратор.';

/** Нельзя снять роль администратора у последнего админа школы — иначе
 * назначать роли станет некому (UserRolesService.updateRoles). */
export const LAST_ADMIN_MESSAGE =
  'Это последний администратор школы. Сначала назначьте другого, потом снимайте эту роль здесь.';
