// Единственная точка сетевых запросов (CLAUDE.md, «одна механика — один
// компонент»): eslint запрещает глобальный fetch вне web/src/api/**, чтобы
// формат ошибок и credentials не разъезжались по компонентам.
import type { ApiErrorBody, ApiErrorCode } from '@xuanxue/shared';

/** Ошибка похода в API — статус, код бэкенда и (если есть) детали/requestId. */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: string[];
  requestId?: string;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode,
    details?: string[],
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

/** Конверт ошибки бэкенда (тип общий с api через shared); поля могут отсутствовать у прокси/CDN. */
type ErrorEnvelope = Partial<ApiErrorBody>;

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface ApiFetchInit {
  method?: ApiMethod;
  body?: unknown;
  signal?: AbortSignal;
}

const NETWORK_ERROR_MESSAGE =
  'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const UNKNOWN_ERROR_MESSAGE = 'Сервер не ответил. Попробуйте ещё раз.';

/**
 * Запрос к API с префиксом `/api`. Бросает `ApiError` на сетевой сбой,
 * на не-2xx ответ (парсит конверт бэкенда) и на 204 возвращает `undefined`.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { method = 'GET', body, signal } = init;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(NETWORK_ERROR_MESSAGE, 0, 'network');
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    let envelope: ErrorEnvelope;
    try {
      envelope = (await response.json()) as ErrorEnvelope;
    } catch {
      throw new ApiError(UNKNOWN_ERROR_MESSAGE, response.status, 'unknown');
    }
    throw new ApiError(
      envelope.message ?? UNKNOWN_ERROR_MESSAGE,
      envelope.statusCode ?? response.status,
      envelope.code ?? 'unknown',
      envelope.details,
      envelope.requestId,
    );
  }

  return (await response.json()) as T;
}
