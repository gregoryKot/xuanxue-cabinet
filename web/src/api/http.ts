// Единственная точка сетевых запросов (CLAUDE.md, «одна механика — один
// компонент»): eslint запрещает глобальный fetch вне web/src/api/**, чтобы
// формат ошибок и credentials не разъезжались по компонентам.
import {
  CSRF_HEADER,
  isMutatingMethod,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@xuanxue/shared';
import { takePrefetched } from './prefetchCache';

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

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

interface ApiFetchInit {
  method?: ApiMethod;
  body?: unknown;
  signal?: AbortSignal;
}

// Экспортирован: тот же текст нужен экранам, которые сами ловят сетевой сбой
// вне apiFetch (LoginScreen, RequireAuth, экран входа по email) — общий
// модуль вместо третьего литерала (CLAUDE.md «Без магических чисел и строк»).
export const NETWORK_ERROR_MESSAGE =
  'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
const UNKNOWN_ERROR_MESSAGE = 'Сервер не ответил. Попробуйте ещё раз.';
const UNAUTHORIZED_STATUS = 401;

// Сессия протухла/отозвана посреди работы (не только при первой загрузке) —
// AuthProvider подписывается сюда, чтобы сбросить себя и увести на /login
// из любого запроса, а не только из своего собственного /auth/me (CLAUDE.md
// «Продукт»/ревью п.12). Модульная переменная, не React-контекст: apiFetch —
// обычная функция вне дерева компонентов.
type UnauthorizedListener = () => void;
let unauthorizedListener: UnauthorizedListener | null = null;

export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

/**
 * Запрос к API с префиксом `/api`. Бросает `ApiError` на сетевой сбой,
 * на не-2xx ответ (парсит конверт бэкенда) и на 204 возвращает `undefined`.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { method = 'GET', body, signal } = init;

  // Данные первого экрана могли начать грузиться раньше, чем этот компонент
  // успел смонтироваться (firstScreenPrefetch.ts кладёт их сюда сразу после
  // ответа /auth/me, параллельно с чанком экрана) — забираем уже летящий
  // промис вместо второго запроса на тот же адрес (prefetchCache.ts). Только
  // GET: мутацию с эффектом на сервере кэш предзагрузки не подменяет никогда.
  if (method === 'GET') {
    const prefetched = takePrefetched(path);
    if (prefetched) return prefetched as Promise<T>;
  }

  const headers: Record<string, string> = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  // CSRF-заголовок (SECURITY §2, ADR-0012) — гвард требует его для любого
  // мутирующего запроса, кроме @SkipCsrf(). Кросс-доменная форма его не
  // поставит, обычный fetch с credentials — всегда.
  if (isMutatingMethod(method)) headers[CSRF_HEADER] = 'fetch';

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
    const status = envelope.statusCode ?? response.status;
    if (status === UNAUTHORIZED_STATUS) unauthorizedListener?.();
    throw new ApiError(
      envelope.message ?? UNKNOWN_ERROR_MESSAGE,
      status,
      envelope.code ?? 'unknown',
      envelope.details,
      envelope.requestId,
    );
  }

  return (await response.json()) as T;
}
