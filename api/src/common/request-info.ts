// Что берётся из входящего запроса для лога и для алёрта админу: код
// обращения и путь без query. Двое потребителей — DomainExceptionFilter
// (неизвестная ошибка сервера, ADR-0053) и ClientErrorsController/Service
// (сбой в браузере, ADR-0071), поэтому не приватные функции внутри фильтра, а
// общий модуль (CLAUDE.md «Одна механика — один компонент»). Пара к
// error-info.ts рядом.
//
// Минимальный интерфейс вместо @types/express (его нет в зависимостях api/):
// `req.id` пишет pino-http (logging.module.ts), `req.method`/`req.url` —
// сам Node.
export interface RequestLike {
  id?: unknown;
  method?: unknown;
  url?: unknown;
}

/** Код обращения из `x-request-id` — он же в теле ошибки у пользователя и в
 * каждой строке лога (CLAUDE.md «Логи»). `undefined` вместо приведения к
 * строке: «undefined» в тексте алёрта выглядит как найденный код, которого
 * нет. */
export function requestIdOf(request: RequestLike): string | undefined {
  return typeof request.id === 'string' ? request.id : undefined;
}

/** Путь без query-строки: там бывают токены входа (`?join=`, `?token=` —
 * SECURITY §6). Редакция лога вырезает их поштучно
 * (logging/request-serializer.ts), но этот путь идёт ещё и в текст алёрта
 * админу — проще убрать query целиком. Заодно отрезается фрагмент (`#…`):
 * вход через Telegram приносит `#tgAuthResult=` прямо в адресе вкладки
 * (ADR-0028), и адрес упавшего экрана мог бы притащить его с собой. */
export function pathWithoutQuery(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}
