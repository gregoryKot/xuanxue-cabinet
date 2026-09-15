// Роли, статусы и константы входа/сессии — общий контракт api и web
// (CLAUDE.md, раздел «Слои»): гварды и DTO в api и CSRF/мутирующие методы в
// web/src/api/http.ts используют одни и те же значения, расхождение ловит tsc.
// Ролей учителя четыре. Ученик — не роль: это подтверждённый человек
// (`status: 'active'`) без единой роли отсюда (ADR-0026), поэтому в списке
// его нет и назначать нечего — экран «Люди» строит переключатели прямо по
// USER_ROLES.
export const USER_ROLES = ['admin', 'teacher', 'assistant', 'accountant'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/**
 * Подписи ролей по-русски — единственный источник для web и бота (CLAUDE.md
 * «Без магических чисел и строк»): экран «Люди» строит переключатели циклом
 * по `USER_ROLES` с этими подписями, а не перечисляет роли руками. Помощник
 * учителя правами равен учителю (везде, где `@Roles('teacher', 'admin')`, —
 * и `'assistant'`), бухгалтер пока не имеет прав нигде (деньги — этап 3,
 * docs/PLAN.md).
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  teacher: 'Учитель',
  assistant: 'Помощник учителя',
  accountant: 'Бухгалтер',
};

/**
 * Роли, которые работают со школой, а не учатся в ней: у помощника учителя
 * права учителя (ROLE_LABELS выше), у админа — тем более. Один список на
 * api и бота (`isStaffRole`) вместо повторения тройки по файлам; `@Roles()`
 * остаётся с явным перечислением — декоратору нужны сами значения.
 */
export const STAFF_ROLES: readonly UserRole[] = ['teacher', 'assistant', 'admin'];

/** Хоть одна роль из STAFF_ROLES — «человек школы», а не ученик. */
export function isStaffRole(roles: readonly UserRole[]): boolean {
  return roles.some((role) => STAFF_ROLES.includes(role));
}

export const USER_STATUSES = ['invited', 'active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Профиль текущей сессии для интерфейса. Ученик — это `active` без ролей
 * учителя (ADR-0026), отдельной роли для него нет и в кабинете.
 * Email, telegramId и googleId сюда намеренно не входят — это ключи входа,
 * не профиль для интерфейса.
 *
 * `status` входит с ADR-0026: вошедший в первый раз ждёт подтверждения
 * (`invited`), и экран должен показать ему ожидание, а не пустое расписание.
 */
export interface MeDto {
  id: string;
  name: string;
  roles: UserRole[];
  tz: string;
  status: UserStatus;
}

/** Вошёл, но школа ещё не подтвердила (ADR-0026) — ответ любого маршрута
 * с данными, пока статус `invited`. Текст говорит, что происходит и чего
 * ждать (docs/VOICE.md), а не «доступа нет». */
export const PENDING_APPROVAL_MESSAGE =
  'Вы вошли, осталось дождаться подтверждения. Учитель откроет доступ, обычно в тот же день.';

/** `status: 'blocked'` (тоже роль без прав) и несовпадение роли — один и тот
 * же отказ и в вебе (`AuthGuard`), и в боте (`BotUserAccessService`, слой
 * 4б.2/ADR-0024): единственный источник текста, не выдумываем формулировку
 * дважды по каналам (CLAUDE.md «Обращение — только "вы"»). За что именно
 * заблокирован человек — не объясняем (докладка не для него). */
export const ACCESS_MESSAGE = 'Доступа нет. Обратитесь к администратору школы.';

/**
 * Тело `POST /auth/telegram` — поля Telegram Login Widget (SECURITY §2).
 * Имена полей — snake_case: формат задаёт виджет Telegram, а не наш API
 * (единственное отклонение от camelCase в CLAUDE.md, раздел «API» — контракт
 * внешний, менять его нельзя).
 */
export interface TelegramLoginInput {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Ответ `GET /auth/config` (`@Public()`, без сессии) — конфигурация экрана
 * входа. `telegramBotId` — числовой id бота (префикс `BOT_TOKEN` до
 * двоеточия), нужен для перехода на Telegram (`redirectToTelegramAuth`, см.
 * LoginScreen.tsx, ADR-0028); без него кнопки входа нет. `schoolSiteUrl` —
 * адрес сайта школы из настроек (`settings.schoolSiteUrl`, экран «Шаблоны»),
 * для гостя без роли
 * (StudentScreen.tsx) и незнакомца в боте: не `PUBLIC_URL` — тот адрес
 * самого кабинета, а не сайта школы (В6 аудита, ADR-0009-доп.).
 */
export interface AuthConfigDto {
  telegramBotId?: number;
  /** Имя бота (`@имя` без собачки) — из него кабинет собирает ссылку в чат
   * с ботом: `t.me/<имя>?start=exam_<attemptId>` для отправки видео
   * экзамена (ADR-0023). Нет бота или Telegram не ответил при старте —
   * поля нет, и кнопка не показывается. */
  telegramBotUsername?: string;
  schoolSiteUrl?: string;
}

/**
 * Заголовок CSRF-защиты (SECURITY §2, ADR-0012): обязателен для любого
 * мутирующего запроса, кроме помеченных `@SkipCsrf()` (вебхук Telegram).
 * Кросс-доменная HTML-форма его не поставит — обычный `fetch` из web ставит
 * всегда (см. http.ts).
 */
export const CSRF_HEADER = 'x-requested-with';

/** Методы, которые CSRF-гвард в api (`auth/csrf.ts`) и http-клиент в web
 * (`api/http.ts`) считают мутирующими — общий список, чтобы фронт и бэк не
 * разъехались по тому, что требует заголовка. */
export const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'] as const;

const MUTATING_METHODS_SET = new Set<string>(MUTATING_METHODS);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS_SET.has(method.toUpperCase());
}
