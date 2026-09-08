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

/**
 * Опция ведущего в форме занятия — `GET /users/teachers` (docs/PLAN.md §6
 * п.2, аудит В4): teacher/admin с активным статусом, без ПДн (SECURITY §1) —
 * только то, что нужно select'у ClassFormFields/LessonFormFields.
 */
export interface TeacherOptionDto {
  id: string;
  name: string;
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

/** `leaderId` у занятия/даты занятия — не существующий teacher/admin с
 * активным статусом (аудит В4: раньше принимался как есть, без проверки).
 * Общий текст для ClassesService и LessonsService (assert-teacher.ts). */
export const LEADER_NOT_FOUND_MESSAGE =
  'Ведущий не найден среди учителей. Отметьте его на экране «Люди» и выберите снова.';
