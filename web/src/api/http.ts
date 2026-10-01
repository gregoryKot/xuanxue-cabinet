// Единственная точка сетевых запросов (CLAUDE.md, «одна механика — один
// компонент»): eslint запрещает глобальный fetch вне web/src/api/**, чтобы
// формат ошибок и credentials не разъезжались по компонентам.
import { APP_VERSION_HEADER, CSRF_HEADER, isMutatingMethod } from '@xuanxue/shared';
import { combineAbortSignals } from './abortSignals';
// ApiError и setUnauthorizedListener живут в apiError.ts (общие с
// uploadWithProgress.ts) — реэкспортированы отсюда, чтобы весь остальной
// код кабинета по-прежнему брал их одной строкой из http.ts, единственной
// точки сети (CLAUDE.md «Одна механика — один компонент»).
import {
  ApiError,
  errorFromEnvelope,
  setUnauthorizedListener,
  UNKNOWN_ERROR_MESSAGE,
  type ErrorEnvelope,
} from './apiError';
import { noteAppVersion } from './appVersion';
import { noteServerDate } from './serverClock';
import { takePrefetched } from './prefetchCache';

export { ApiError, setUnauthorizedListener };

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ApiFetchInit {
  method?: ApiMethod;
  body?: unknown;
  signal?: AbortSignal;
  /** Пережить выгрузку страницы: такой запрос браузер не обрывает вместе с
   * вкладкой. По спецификации тело ограничено 64 КиБ на все живые
   * keepalive-запросы разом, поэтому ставится точечно — отчёт о сбое
   * (ADR-0071), а не все подряд. */
  keepalive?: boolean;
  /** Свой таймаут вместо `API_TIMEOUT_MS`, см. `UPLOAD_TIMEOUT_MS`. */
  timeoutMs?: number;
}

// Аудит 2026-09-21: без своего таймера зависший TCP/TLS или не отвечающий
// сервер держал `await fetch` до системного таймаута браузера (минуты) —
// скелетон/кнопка висли в pending без ошибки и без повтора. На бэке так уже
// у каждого исходящего fetch (`AbortSignal.timeout`).
export const API_TIMEOUT_MS = 30_000;
// Загрузка файла (сырое тело Blob) на плохой связи ученика в API_TIMEOUT_MS
// не укладывается — ставится явным `timeoutMs` в местах загрузки.
export const UPLOAD_TIMEOUT_MS = 120_000;

// Текст по docs/VOICE.md. Отдельно от NETWORK_ERROR_MESSAGE: вызывающий код
// (useAbortableFetch и т.п.) различает «сети нет» и «сервер не отвечает»,
// хотя оба приходят как ApiError со status 0 и code 'network'.
export const TIMEOUT_ERROR_MESSAGE =
  'Сервер долго не отвечает. Проверьте интернет и попробуйте ещё раз.';

// Экспортирован: тот же текст нужен экранам, которые сами ловят сетевой сбой
// вне apiFetch (LoginScreen, RequireAuth, экран входа по email) — общий
// модуль вместо третьего литерала (CLAUDE.md «Без магических чисел и строк»).
export const NETWORK_ERROR_MESSAGE =
  'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
/**
 * Запрос к API с префиксом `/api`. Бросает `ApiError` на сетевой сбой,
 * на не-2xx ответ (парсит конверт бэкенда) и на 204 возвращает `undefined`.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { method = 'GET', body, signal, keepalive, timeoutMs = API_TIMEOUT_MS } = init;

  // Данные первого экрана могли начать грузиться раньше, чем этот компонент
  // успел смонтироваться (prefetchFirstScreen.ts кладёт их сюда сразу после
  // ответа /auth/me, параллельно с чанком экрана) — забираем уже летящий
  // промис вместо второго запроса на тот же адрес (prefetchCache.ts). Только
  // GET: мутацию с эффектом на сервере кэш предзагрузки не подменяет никогда.
  if (method === 'GET') {
    const prefetched = takePrefetched(path);
    if (prefetched) return prefetched as Promise<T>;
  }

  // Картинка варианта ответа (ADR-0035) уходит как есть, без JSON.stringify —
  // сырое тело с её собственным типом (POST /exam-images), а не строка в
  // кавычках. Остальные запросы — JSON, как раньше.
  const isBlobBody = body instanceof Blob;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (isBlobBody) headers['content-type'] = body.type;
  else if (body !== undefined) headers['content-type'] = 'application/json';
  // CSRF-заголовок (SECURITY §2, ADR-0012) — гвард требует его для любого
  // мутирующего запроса, кроме @SkipCsrf(). Кросс-доменная форма его не
  // поставит, обычный fetch с credentials — всегда.
  if (isMutatingMethod(method)) headers[CSRF_HEADER] = 'fetch';

  // Свой таймер, не только signal вызывающего — сеть, которая не рвётся, а
  // просто не отвечает, держала бы fetch до таймаута браузера. combineAbort-
  // Signals — только когда внешний signal реально есть.
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const requestSignal = signal
    ? combineAbortSignals([timeoutController.signal, signal])
    : timeoutController.signal;

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: isBlobBody || body === undefined ? body : JSON.stringify(body),
      signal: requestSignal,
      keepalive,
    });
  } catch {
    // Отличаем свой таймаут от отмены вызывающим: сработал наш таймер, а не
    // внешний signal — сервер завис, а не запрос отменили нарочно
    // (useAbortableFetch отменяет устаревшие запросы через свой signal).
    // Отмену вызывающим оставляем как раньше — тем же ApiError, тем же текстом.
    if (timeoutController.signal.aborted && !signal?.aborted) {
      throw new ApiError(TIMEOUT_ERROR_MESSAGE, 0, 'network');
    }
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'network');
  } finally {
    clearTimeout(timer);
  }

  // До проверок статуса: версия сборки (ADR-0101) едет и в ответе об ошибке,
  // а деплой не должен остаться незамеченным только потому, что запрос упал.
  noteAppVersion(response.headers.get(APP_VERSION_HEADER));
  // Часы сервера для отсчёта дедлайна (serverClock.ts, аудит 2026-10-01):
  // заголовок Date есть у каждого ответа, в том числе об ошибке.
  noteServerDate(response.headers.get('date'), Date.now());

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    let envelope: ErrorEnvelope;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      throw new ApiError(UNKNOWN_ERROR_MESSAGE, response.status, 'unknown');
    }
    // 401-слушатель и сборка ApiError — общий хвост с uploadWithProgress.ts
    // (apiError.ts, аудит 2026-09-27).
    throw errorFromEnvelope(
      envelope,
      response.status,
      response.headers.get('Retry-After'),
    );
  }

  return (await response.json()) as T;
}
