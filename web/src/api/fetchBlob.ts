// Байты файла со своего домена целиком (ADR-0189): `apiFetch` читает только JSON,
// а кнопке «Перегнать видео» нужны байты старого ролика, чтобы перегнать его в
// браузере. Лежит в api/ рядом с http.ts: глобальный fetch eslint пускает только
// сюда. Те же правила, что у apiFetch, — свой таймер и отмена вызывающего,
// ошибка сервера в `ApiError` (по статусу видно «нет доступа»).
import { combineAbortSignals } from './abortSignals';
import {
  errorFromEnvelope,
  UNKNOWN_ERROR_MESSAGE,
  type ErrorEnvelope,
  ApiError,
} from './apiError';
import { NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from './http';

export interface FetchBlobOptions {
  signal: AbortSignal;
  /** Потолок на весь ответ, вместе с чтением тела: файл идёт долго, но молчать
   * сеть не должна. */
  timeoutMs: number;
}

async function failureFrom(response: Response): Promise<ApiError> {
  try {
    const envelope = (await response.json()) as ErrorEnvelope;
    return errorFromEnvelope(envelope, response.status);
  } catch {
    return new ApiError(UNKNOWN_ERROR_MESSAGE, response.status, 'unknown');
  }
}

/** `path` — полный адрес вместе с `/api` (например, `examVideoBytesSrc`). */
export async function fetchBlob(path: string, options: FetchBlobOptions): Promise<Blob> {
  const { signal, timeoutMs } = options;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      credentials: 'include',
      signal: combineAbortSignals([timeout.signal, signal]),
    });
    if (!response.ok) throw await failureFrom(response);
    return await response.blob();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    // Сработал наш таймер, а не отмена вызывающего: сервер завис (как в http.ts).
    if (timeout.signal.aborted && !signal.aborted) {
      throw new ApiError(TIMEOUT_ERROR_MESSAGE, 0, 'network');
    }
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'network');
  } finally {
    clearTimeout(timer);
  }
}
