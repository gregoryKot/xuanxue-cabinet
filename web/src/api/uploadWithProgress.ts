// Загрузка файла с прогрессом — единственный сценарий web/src/api/http.ts не
// покрывает: `fetch` не отдаёт событие прогресса отправки тела, только
// `XMLHttpRequest.upload.onprogress` (отзыв владельца с телефона, ADR-0133).
// Поведение то же, что у apiFetch — credentials, CSRF/заголовок версии, разбор
// конверта ошибки (apiError.ts, общий с http.ts, не второй разбор), будильник
// unauthorizedListener на 401, AbortSignal — расходится только таймаут.
import { APP_VERSION_HEADER, CSRF_HEADER, isMutatingMethod } from '@xuanxue/shared';
import {
  ApiError,
  errorFromEnvelope,
  parseErrorEnvelope,
  UNKNOWN_ERROR_MESSAGE,
} from './apiError';
import { noteAppVersion } from './appVersion';
import { API_TIMEOUT_MS, NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from './http';

type UploadMethod = 'POST' | 'PUT';

interface UploadWithProgressInit {
  method?: UploadMethod;
  body: Blob;
  signal?: AbortSignal;
  /** Доля от 0 до 1 — вызывается на каждое событие прогресса отправки. */
  onProgress?: (fraction: number) => void;
  /** Свой таймаут бездействия вместо `API_TIMEOUT_MS` — см. комментарий у
   * таймера ниже. Отдельный параметр, не общий с apiFetch `timeoutMs`: там
   * это потолок на весь запрос, здесь — на паузу между событиями прогресса. */
  inactivityTimeoutMs?: number;
}

/**
 * POST/PUT файла как есть (без `JSON.stringify`, как Blob-тело в apiFetch), с
 * колбэком прогресса отправки. Таймаут — **не общий потолок на запрос**: клип
 * 50 МБ на медленном мобильном аплинке грузится минутами, и общий
 * `API_TIMEOUT_MS`/`UPLOAD_TIMEOUT_MS` оборвал бы живую передачу на середине
 * (баг apiFetch с фиксированным `timeoutMs` для загрузки — этот модуль его не
 * повторяет). Вместо этого таймер сбрасывается на каждое событие прогресса и
 * обрывает загрузку, только если сервер не подтверждает получение байт вовсе.
 */
export function uploadWithProgress<T>(
  path: string,
  init: UploadWithProgressInit,
): Promise<T> {
  const {
    method = 'POST',
    body,
    signal,
    onProgress,
    inactivityTimeoutMs = API_TIMEOUT_MS,
  } = init;

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader('content-type', body.type || 'application/octet-stream');
    if (isMutatingMethod(method)) xhr.setRequestHeader(CSRF_HEADER, 'fetch');

    let timedOut = false;
    let timer: ReturnType<typeof setTimeout>;
    function resetInactivityTimer(): void {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timedOut = true;
        xhr.abort();
      }, inactivityTimeoutMs);
    }
    resetInactivityTimer();

    function onExternalAbort(): void {
      xhr.abort();
    }
    signal?.addEventListener('abort', onExternalAbort);

    function cleanup(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onExternalAbort);
    }

    xhr.upload.onprogress = (event) => {
      resetInactivityTimer();
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };

    // `xhr.abort()` — и наш таймер бездействия, и отмена вызывающим (тот же
    // signal, что у apiFetch): различаем их так же, как apiFetch различает
    // свой таймаут и отмену снаружи (http.ts).
    xhr.onabort = () => {
      cleanup();
      reject(
        new ApiError(
          timedOut ? TIMEOUT_ERROR_MESSAGE : NETWORK_ERROR_MESSAGE,
          0,
          'network',
        ),
      );
    };
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(NETWORK_ERROR_MESSAGE, 0, 'network'));
    };
    xhr.onload = () => {
      cleanup();
      // До проверок статуса — тот же порядок, что у apiFetch (ADR-0101).
      noteAppVersion(xhr.getResponseHeader(APP_VERSION_HEADER));

      if (xhr.status === 204) {
        resolve(undefined as T);
        return;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiError(UNKNOWN_ERROR_MESSAGE, xhr.status, 'unknown'));
        }
        return;
      }
      const envelope = parseErrorEnvelope(xhr.responseText);
      if (!envelope) {
        reject(new ApiError(UNKNOWN_ERROR_MESSAGE, xhr.status, 'unknown'));
        return;
      }
      reject(errorFromEnvelope(envelope, xhr.status));
    };

    xhr.send(body);
  });
}
