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
 * Не экспортируется (аудит M8): наружу нужна только `isStaffRole`. */
const STAFF_ROLES: readonly UserRole[] = ['teacher', 'assistant', 'admin'];

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

/** `status: 'blocked'` и несовпадение роли — один отказ и в вебе (`AuthGuard`),
 * и в боте (`BotUserAccessService`, ADR-0024): единственный источник текста
 * (CLAUDE.md «Обращение — только "вы"»). За что заблокирован — не объясняем. */
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

/** Тело `POST /auth/email/request` (ADR-0005, ADR-0029) — ответ один и тот
 * же для известного и неизвестного email (SECURITY §2). `inviteCode` — код
 * со страницы `/join/:code` (ADR-0030, invite-link.ts): неверный молча
 * игнорируется, письмо всё равно уходит. */
export interface RequestEmailLoginInput {
  email: string;
  inviteCode?: string;
}

/** Тело `POST /auth/email/verify` — токен из ссылки в письме, 64 hex. */
export interface VerifyEmailLoginInput {
  token: string;
}

/** Email-вход выключен конфигурацией — нет RESEND_API_KEY/MAIL_FROM/PUBLIC_URL
 * (ADR-0029), не обязателен в production. */
export const EMAIL_LOGIN_NOT_AVAILABLE_MESSAGE =
  'Вход по почте пока не подключён. Войдите через Telegram или напишите администратору школы.';

/** Один текст на «протухла» и «уже использована» (SECURITY §2) — иначе
 * формулировка подсказывала бы постороннему, какая причина верна. */
export const EMAIL_LOGIN_EXPIRED_MESSAGE =
  'Ссылка устарела или уже использована. Запросите новую на странице входа.';

/** Resend ответил ошибкой — не тихий отказ (CLAUDE.md «Логи»). */
export const EMAIL_LOGIN_SEND_FAILED_MESSAGE =
  'Не удалось отправить письмо. Попробуйте ещё раз через минуту.';

/**
 * Ответ `GET /auth/config` (`@Public()`, без сессии) — конфигурация экрана
 * входа. `telegramBotId` — числовой id бота (префикс `BOT_TOKEN`), нужен
 * для перехода на Telegram (`redirectToTelegramAuth`, ADR-0028); без него
 * кнопки входа нет. `schoolSiteUrl` — адрес сайта школы из настроек, для
 * гостя без роли и незнакомца в боте (не `PUBLIC_URL` — тот адрес самого
 * кабинета, В6 аудита, ADR-0009-доп.). `emailLoginEnabled` — не опционально:
 * `false` без `RESEND_API_KEY`/`MAIL_FROM`/`PUBLIC_URL` (ADR-0029), форма
 * почты тогда скрыта, а не зовёт впустую 503. */
export interface AuthConfigDto {
  telegramBotId?: number;
  /** Имя бота (`@имя` без собачки) — из него кабинет собирает ссылку в чат:
   * `t.me/<имя>?start=exam_<attemptId>` (ADR-0023). Нет бота или Telegram не
   * ответил при старте — поля нет, кнопки не будет. */
  telegramBotUsername?: string;
  schoolSiteUrl?: string;
  emailLoginEnabled: boolean;
}

/** Заголовок CSRF-защиты (SECURITY §2, ADR-0012): обязателен для любого
 * мутирующего запроса, кроме `@SkipCsrf()` (вебхук Telegram) — кросс-доменная
 * форма его не поставит, `fetch` из web ставит всегда (см. http.ts). */
export const CSRF_HEADER = 'x-requested-with';

/** Методы, которые CSRF-гвард в api (`auth/csrf.ts`) и http-клиент в web
 * (`api/http.ts`) считают мутирующими — общий список, чтобы фронт и бэк не
 * разъехались по тому, что требует заголовка. Не экспортируется (аудит M8):
 * обе стороны зовут только `isMutatingMethod`. */
const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'] as const;

const MUTATING_METHODS_SET = new Set<string>(MUTATING_METHODS);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS_SET.has(method.toUpperCase());
}
