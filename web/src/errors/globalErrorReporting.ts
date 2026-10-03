// Глобальные слушатели необработанных сбоев браузера (ADR-0071).
// ErrorBoundary ловит только падение React-рендера — необработанный throw
// вне рендера (обработчик события, setTimeout) и промис без .catch мимо неё
// проходят и до этого модуля вообще нигде не оставляли следа.
//
// Модульный флаг вместо повторной установки: main.tsx зовёт функцию один
// раз, но StrictMode в разработке вызывает эффекты дважды, а тесты
// перезапускают модуль — без флага второй вызов повесил бы второй слушатель,
// и один и тот же сбой ушёл бы на сервер отчётом дважды.
import { isForeignScriptError } from './errorSource';
import { reportClientError } from './reportClientError';

// Чужой код (расширение браузера, скрипт с другого домена) приходит двумя
// видами. 'Script error.' без файла, строки и стека — браузер прячет
// подробности по CORS, показать в отчёте нечего, а таких сообщений даже у
// здорового кабинета набегает много — без фильтра они съели бы весь потолок
// в 3 отчёта (reportClientError.ts) впустую. Второй вид — с текстом, но брошен
// не нашим файлом: с чужим адресом скрипта (Safari отдаёт текст расширения
// целиком, прячет только адрес) или с адресом самой страницы (код, который
// приложение вроде Brave на iPhone выполнило прямо в ней): оба отсекает
// errorSource.ts.
const SCRIPT_ERROR_MESSAGE = 'Script error.';

// Имя, с которым браузер отклоняет промис отменённой операции (DOMException).
const ABORT_ERROR_NAME = 'AbortError';

/** Настоящая ошибка выполнения JS, а не шум. Событие неудачной загрузки
 * ресурса (`<img>`, `<link>`, `<script src>`) тоже называется `error`, но
 * летит с `event.target` — самим элементом, а не `window`, и без
 * `event.error`: это не сбой кабинета, а битая картинка или недогрузившийся
 * шрифт, репортить нечего. Сравнение через `instanceof Window`, не `===
 * window`: у jsdom (тесты) внутреннее и внешнее представление window —
 * разные объекты, строгое равенство с глобальным `window` ложно даже для
 * событий, которые сам jsdom выставил на window. */
function isReportableErrorEvent(event: ErrorEvent): boolean {
  if (!(event.target instanceof Window)) return false;
  if (
    isForeignScriptError(
      { filename: event.filename, error: event.error },
      window.location,
    )
  ) {
    return false;
  }
  if (event.error) return true;
  return Boolean(event.message) && event.message !== SCRIPT_ERROR_MESSAGE;
}

function handleError(event: ErrorEvent): void {
  if (!isReportableErrorEvent(event)) return;
  void reportClientError('unhandled', event.error ?? event.message);
}

/** Отмена операции браузером, а не сбой. Имя читаем утиной типизацией, не
 * `instanceof DOMException`: объект может прийти из другого realm (iframe,
 * расширение), и тогда `instanceof` нашего окна его не узнает.
 *
 * Инцидент 2026-10-03: владельцу пришёл «Сбой в браузере» с `/attempts/:id`
 * (iPhone Safari), текст `AbortError: The operation was aborted.`, а ученик в
 * это время спокойно сохранял ответы. Так Safari отклоняет `video.play()`,
 * прерванный `load()` или сменой источника, и так же — fetch, отменённый
 * через AbortSignal без своей причины. Это отмена, и человек от неё ничего не
 * теряет. Источник не определить: у DOMException в Safari нет стека, поэтому
 * `isForeignScriptError` (errorSource.ts) считает такую ошибку нашей.
 *
 * Настоящие сбои этим не прячем: наши отменяемые вызовы (useAbortableFetch,
 * apiFetch, play() в videoRecoveryController.ts) сами превращают сбой в
 * ApiError или текст на экране, а до `unhandledrejection` доходит только
 * отмена, которую никто не ждал и на которую никто не опирается. */
export function isCancellation(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) return false;
  return (reason as { name?: unknown }).name === ABORT_ERROR_NAME;
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  if (isCancellation(event.reason)) return;
  if (isForeignScriptError({ error: event.reason }, window.location)) return;
  void reportClientError('unhandled', event.reason);
}

let installed = false;

/** Вешает слушатели `error`/`unhandledrejection` один раз за вкладку. */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);
}
