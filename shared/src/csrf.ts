// CSRF-защита (SECURITY §2, ADR-0012) — общий контракт api и web (CLAUDE.md
// «Слои»). Вынесено из auth.ts отдельным файлом (file-size-ratchet, CLAUDE.md
// «Храповики»): это не про роли и статусы человека, а про то, какой HTTP-метод
// обязан нести заголовок.

/** Заголовок CSRF-защиты: обязателен для любого мутирующего запроса, кроме
 * `@SkipCsrf()` (вебхук Telegram) — кросс-доменная форма его не поставит,
 * `fetch` из web ставит всегда (см. web/src/api/http.ts). */
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
