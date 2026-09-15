// Ссылка-приглашение школы (ADR-0030): один код на школу, «создать новую»
// делает прежний недействительным — то же самое, что и отзыв при утечке.
// Общий контракт api и web (CLAUDE.md «Слои»).

/** Формат кода — `randomBytes(16).toString('hex')`, 32 hex-символа (128 бит):
 * пространство кодов настолько велико, что подбор кодом не грозит, срок
 * жизни ссылке не нужен. Используется и в DTO (`@Matches`), и на фронте
 * (маршрут `/join/:code`). */
export const INVITE_CODE_RE = /^[0-9a-f]{32}$/;

/** Префикс payload `/start` бота для этой ссылки (ADR-0030 «Бот») —
 * `t.me/<бот>?start=join_<code>`, отличает её от других deep-link'ов бота
 * (`exam_<attemptId>`, ADR-0023). Собирается в InviteLinkService (сервер —
 * источник формата), разбирается в start.handler.ts. */
export const INVITE_TELEGRAM_START_PREFIX = 'join_';

/**
 * Ответ `GET /users/invite-link` и `POST /users/invite-link` (admin и
 * teacher). `url: null` — ссылку ещё ни разу не создавали, экран «Люди»
 * показывает кнопку «Создать ссылку» вместо самой ссылки. `telegramUrl` —
 * та же ссылка через бота, `null` вместе с `url` или если имя бота ещё не
 * известно (бот не прогрелся, тот же случай, что telegramBotUsername в
 * AuthConfigDto).
 */
export interface InviteLinkDto {
  url: string | null;
  telegramUrl: string | null;
}

/** Тело `POST /auth/join` и `POST /auth/join/check` — код из адреса
 * `/join/<code>`. Один тип на оба маршрута: форма запроса одна и та же
 * (CLAUDE.md «Дубли»), различается только то, что делает сервер дальше. */
export interface JoinByInviteInput {
  code: string;
}

/** Ответ `POST /auth/join/check` (`@Public()`) — экран `/join/:code` до
 * входа узнаёт, стоит ли вообще показывать кнопки входа. */
export interface CheckInviteResultDto {
  valid: boolean;
}

/** Ссылку не собрать — `PUBLIC_URL` не задан (CLAUDE.md «Конфигурация»):
 * видит только admin на «Людях», не ученик. */
export const INVITE_LINK_NOT_AVAILABLE_MESSAGE =
  'Ссылка-приглашение недоступна: не задан адрес сайта (PUBLIC_URL).';

/** Код неизвестен — ссылку уже заменили новой или её никогда не было
 * (SECURITY §2: один и тот же текст на обе причины, не подсказываем,
 * какая из них верна). */
export const INVITE_LINK_INVALID_MESSAGE =
  'Ссылка-приглашение не действует. Попросите у учителя новую.';
