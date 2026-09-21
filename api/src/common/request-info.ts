// Что берётся из входящего запроса для лога и для алёрта админу: код
// обращения и путь без query. Двое потребителей — DomainExceptionFilter
// (неизвестная ошибка сервера, ADR-0053) и ClientErrorsController/Service
// (сбой в браузере, ADR-0071), поэтому не приватные функции внутри фильтра, а
// общий модуль (CLAUDE.md «Одна механика — один компонент»). Пара к
// error-info.ts рядом.
import { randomUUID } from 'crypto';

// Минимальный интерфейс вместо @types/express (его нет в зависимостях api/):
// `req.id` пишет pino-http (logging.module.ts), `req.method`/`req.url` —
// сам Node.
export interface RequestLike {
  id?: unknown;
  method?: unknown;
  url?: unknown;
}

/** Заголовок сквозной трассировки запроса (CLAUDE.md «Логи»). Третий
 * потребитель — raw-upload-concurrency.ts: та middleware стоит в
 * express-стеке РАНЬШЕ внутреннего роутера Nest (а значит и раньше
 * pino-http, который обычно пишет `req.id`), поэтому не может прочитать
 * `req.id` — читает заголовок тем же способом, что и логирование. */
export const REQUEST_ID_HEADER = 'x-request-id' as const;

/** Код из входящего заголовка `x-request-id` или новый `randomUUID()` —
 * та же логика, что genReqId в logging/logging.module.ts (общий, чтобы не
 * разъезжались два способа завести код обращения, CLAUDE.md «Дубли»). */
export function incomingRequestId(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 ? value : randomUUID();
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
