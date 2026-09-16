// Роли, статусы и константы входа/сессии — общий контракт api и web
// (CLAUDE.md, раздел «Слои»): гварды и DTO в api и CSRF/мутирующие методы в
// web/src/api/http.ts используют одни и те же значения, расхождение ловит tsc.
// Ролей учителя четыре. Ученик — не роль: это человек со `status: 'active'`
// без единой роли отсюда (ADR-0026), поэтому в списке его нет и назначать
// нечего — экран «Люди» строит переключатели прямо по USER_ROLES.
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

// Статуса «ожидает подтверждения» больше нет (ADR-0034, отменяет ADR-0026
// в этой части): регистрация идёт только по ссылке-приглашению школы
// (ADR-0030), сразу `active` — ждать больше нечего. Инцидент 2026-09-15
// (владелец мельком увидел экран ожидания между входом и присоединением) —
// причина убрать промежуточное состояние с концами, а не чинить гонку.
export const USER_STATUSES = ['active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Профиль текущей сессии для интерфейса. Ученик — это `active` без ролей
 * учителя (ADR-0026), отдельной роли для него нет и в кабинете.
 * Email, telegramId и googleId сюда намеренно не входят — это ключи входа,
 * не профиль для интерфейса. `telegramLinked` — не id, а признак «бот меня
 * узнает» (ADR-0023, §8.17): им экран попытки решает, показывать ли кнопку
 * бота.
 */
export interface MeDto {
  id: string;
  name: string;
  roles: UserRole[];
  tz: string;
  status: UserStatus;
  telegramLinked: boolean;
}

/** Нового человека без ссылки-приглашения (ADR-0030, ADR-0034) в кабинет не
 * пускаем — ни `POST /auth/telegram`, ни `POST /auth/email/verify` не
 * заводят аккаунт без валидного `inviteCode`. Текст — с действием
 * (docs/VOICE.md): что сделать, чтобы попасть внутрь. */
export const NO_INVITE_LINK_MESSAGE =
  'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.';

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

/** Тело `POST /auth/email/verify` — токен из ссылки в письме, 64 hex.
 * `inviteCode` — страница `/login/email` читает его из query `?join=<code>`
 * (ADR-0030, ADR-0034) и шлёт вместе с verify: у нового человека без него
 * или с неверным кодом верификация не заводит аккаунт. */
export interface VerifyEmailLoginInput {
  token: string;
  inviteCode?: string;
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
