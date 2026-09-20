// Глобальные слушатели необработанных сбоев браузера (ADR-0071).
// ErrorBoundary ловит только падение React-рендера — необработанный throw
// вне рендера (обработчик события, setTimeout) и промис без .catch мимо неё
// проходят и до этого модуля вообще нигде не оставляли следа.
//
// Модульный флаг вместо повторной установки: main.tsx зовёт функцию один
// раз, но StrictMode в разработке вызывает эффекты дважды, а тесты
// перезапускают модуль — без флага второй вызов повесил бы второй слушатель,
// и один и тот же сбой ушёл бы на сервер отчётом дважды.
import { reportClientError } from './reportClientError';

// 'Script error.' без файла, строки и стека — типичный признак чужого origin
// (скрипт CDN без crossorigin, расширение браузера): браузер прячет
// подробности по CORS, показать в отчёте нечего, а таких сообщений даже у
// здорового кабинета набегает много — без фильтра они съели бы весь потолок
// в 3 отчёта (reportClientError.ts) впустую.
const SCRIPT_ERROR_MESSAGE = 'Script error.';

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
  if (event.error) return true;
  return Boolean(event.message) && event.message !== SCRIPT_ERROR_MESSAGE;
}

function handleError(event: ErrorEvent): void {
  if (!isReportableErrorEvent(event)) return;
  void reportClientError('unhandled', event.error ?? event.message);
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
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
