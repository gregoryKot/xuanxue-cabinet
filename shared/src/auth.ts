// Роли, статусы и константы входа/сессии — общий контракт api и web
// (CLAUDE.md, раздел «Слои»): гварды и DTO в api и CSRF/мутирующие методы в
// web/src/api/http.ts используют одни и те же значения, расхождение ловит tsc.
export const USER_ROLES = ['admin', 'teacher', 'student'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['invited', 'active', 'blocked'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Профиль текущей сессии для интерфейса. Пользователь без единой роли
 * (`roles: []`) — гость (SECURITY §2): ничего не видит, кроме этого ответа.
 * Email, telegramId, googleId и status сюда намеренно не входят — это ключи
 * входа и служебное состояние, не профиль для интерфейса.
 */
export interface MeDto {
  id: string;
  name: string;
  roles: UserRole[];
  tz: string;
}

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
