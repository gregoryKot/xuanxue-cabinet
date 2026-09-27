// Что делается с неизвестной ошибкой (500) помимо ответа: алёрт админу в
// Telegram (ADR-0053) и запись в журнал сбоев (ADR-0132). Вынесено из
// DomainExceptionFilter, чтобы фильтр остался про перевод ошибки в HTTP, а
// не рос с каждым новым получателем (храповик размера файлов, CLAUDE.md §5).
// Оба получателя необязательны и оба fire-and-forget: ни один не имеет права
// задержать или сломать ответ пользователю (CLAUDE.md «Ошибки»).
import { DateTime } from 'luxon';
import type { Logger } from 'nestjs-pino';
import type { AppErrorAlerts } from './app-error-alerts';
import type { AppErrorJournal } from './app-error-journal';
import { errorMessage } from './error-info';
import { pathWithoutQuery, userAgentOf, type RequestLike } from './request-info';

export interface UnknownErrorReportDeps {
  logger: Logger;
  alerts?: AppErrorAlerts;
  journal?: AppErrorJournal;
}

export interface UnknownErrorContext {
  request: RequestLike;
  requestId?: string;
  exception: unknown;
}

/** `'-'` вместо undefined, если запрос синтетический (не HTTP). */
function requestTarget(request: RequestLike): { method: string; path: string } {
  const method = typeof request.method === 'string' ? request.method : '-';
  const url = typeof request.url === 'string' ? request.url : undefined;
  return { method, path: url === undefined ? '-' : pathWithoutQuery(url) };
}

export function reportUnknownError(
  deps: UnknownErrorReportDeps,
  { request, requestId, exception }: UnknownErrorContext,
): void {
  const target = requestTarget(request);
  const message = errorMessage(exception);
  const now = DateTime.utc();
  const logFailure =
    (what: string) =>
    (err: unknown): void => {
      deps.logger.error(`${what} (requestId=${requestId ?? '-'}): ${errorMessage(err)}`);
    };

  deps.alerts
    ?.notifyServerError({ requestId, ...target, message }, now)
    .catch(logFailure('app_error alert: не удалось уведомить админа'));

  deps.journal
    ?.record(
      {
        requestId,
        source: 'server',
        kind: 'server',
        ...target,
        text: message,
        userAgent: userAgentOf(request),
      },
      now,
    )
    .catch(logFailure('app_error journal: не удалось записать сбой'));
}
