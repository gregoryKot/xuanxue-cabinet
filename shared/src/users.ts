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
  /** Вошёл через Telegram (виджет или бот), а не только по почте (ADR-0029 —
   * email тоже путь входа) — поле не называется `telegramId`, чтобы не
   * тянуть за собой сам идентификатор. */
  hasTelegram: boolean;
  lastLoginAt?: string;
  /** Стал `active` по ссылке-приглашению школы (ADR-0030) — число «По ссылке
   * пришли» на «Людях» строится по этому полю. После ADR-0036 регистрация
   * возможна только по ссылке; без пометки остаются лишь бутстрап-админ
   * (`BOOTSTRAP_ADMIN_TELEGRAM_ID` заводится без кода — подтверждать его
   * некому) и люди, заведённые до миграции 0007 — она не расставляет это
   * поле задним числом. */
  joinedViaInvite: boolean;
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

/** Тело `PATCH /users/:id/status` — блокировка/открытие доступа на экране
 * «Люди» (ADR-0036, миграция 0007, RUNBOOK §8.15: обещание «лишних админ
 * заблокирует на «Людях»» до этого эндпоинта было не выполнено). Обратимо —
 * `active` открывает доступ снова, поэтому в отличие от ролей и удаления
 * подтверждения в интерфейсе не требует. */
export interface UpdateUserStatusInput {
  status: UserStatus;
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

/** Нельзя закрыть себе доступ (UserStatusService.updateStatus) — некому
 * будет открыть его обратно, симметрично SELF_DEMOTE_MESSAGE выше. */
export const SELF_BLOCK_MESSAGE =
  'Свой доступ закрыть нельзя — попросите об этом другого администратора.';

/** Нельзя закрыть доступ последнему активному администратору школы — иначе
 * открывать доступ обратно станет некому (UserStatusService.updateStatus,
 * симметрично LAST_ADMIN_MESSAGE выше; считаются только активные админы —
 * заблокированный сам открыть чужой доступ не может). */
export const LAST_ADMIN_BLOCK_MESSAGE =
  'Это последний администратор школы. Сначала назначьте другого, потом закрывайте ему доступ.';

/** Нельзя удалить свой же аккаунт — некому будет подтвердить и вернуть себе
 * доступ после удаления (UserDeletionService.deleteAllUserData, аудит В11). */
export const SELF_DELETE_MESSAGE =
  'Свой аккаунт удалить нельзя — попросите об этом другого администратора.';

/** `leaderId` у занятия/даты занятия — не существующий teacher/admin с
 * активным статусом (аудит В4: раньше принимался как есть, без проверки).
 * Общий текст для ClassesService и LessonsService (assert-teacher.ts). */
export const LEADER_NOT_FOUND_MESSAGE =
  'Ведущий не найден среди учителей. Отметьте его на экране «Люди» и выберите снова.';
