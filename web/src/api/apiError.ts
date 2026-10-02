// Общая часть разбора ошибок API — конверт с бэкенда → ApiError (CLAUDE.md
// «Ошибки»). Вынесено из http.ts (аудит 2026-09-27), когда разбор делили
// apiFetch и XHR-загрузка видео с прогрессом; та загрузка заменена общим
// загрузчиком частями (video-upload/, ADR-0165), а модуль остался отдельным,
// чтобы http.ts не рос (файловый храповик, CLAUDE.md «Храповики»).
import type { ApiErrorBody, ApiErrorCode } from '@xuanxue/shared';

/** Ошибка похода в API — статус, код бэкенда и (если есть) детали/requestId. */
export class ApiError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: string[];
  requestId?: string;
  /** Заголовок `Retry-After` ответа (секунды) — сейчас его ставит только
   * потолок одновременных сырых загрузок (raw-upload-concurrency.ts, 503,
   * ADR-0137): подсказка, через сколько повторить, честнее собственного
   * расписания повторов. `undefined`, если заголовка не было. */
  retryAfterSec?: number;

  constructor(
    message: string,
    status: number,
    code: ApiErrorCode,
    details?: string[],
    requestId?: string,
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Секунды из `Retry-After`; не число или нет заголовка — `undefined`. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/** Конверт ошибки бэкенда (тип общий с api через shared); поля могут отсутствовать у прокси/CDN. */
export type ErrorEnvelope = Partial<ApiErrorBody>;

export const UNKNOWN_ERROR_MESSAGE = 'Сервер не ответил. Попробуйте ещё раз.';
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

/** Строит `ApiError` из конверта и будит `unauthorizedListener` на 401 —
 * хвост apiFetch после разбора не-2xx ответа. */
export function errorFromEnvelope(
  envelope: ErrorEnvelope,
  responseStatus: number,
  retryAfterHeader: string | null = null,
): ApiError {
  const status = envelope.statusCode ?? responseStatus;
  if (status === UNAUTHORIZED_STATUS) unauthorizedListener?.();
  return new ApiError(
    envelope.message ?? UNKNOWN_ERROR_MESSAGE,
    status,
    envelope.code ?? 'unknown',
    envelope.details,
    envelope.requestId,
    parseRetryAfter(retryAfterHeader),
  );
}
