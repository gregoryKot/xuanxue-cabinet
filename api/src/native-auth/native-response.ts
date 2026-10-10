// Единый вид ответа нативных маршрутов (профиль Workshop 3c98d4a, «Transport»):
// токены и аккаунт не кэшируются ни браузером, ни прокси, ошибка — только
// `{"error":"<код>"}`, `Set-Cookie` не ставится никогда. И успех, и отказ идут
// через этот файл, чтобы заголовки не разошлись.
import {
  HttpStatus,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { NativeErrorCode } from '@xuanxue/shared';
import { NATIVE_ERROR_STATUS } from './native-auth-error';

/** Минимальный интерфейс вместо `@types/express` (его нет в зависимостях api). */
export interface NativeResponseLike {
  status(code: number): NativeResponseLike;
  setHeader(name: string, value: string | number): unknown;
  getHeader(name: string): number | string | string[] | undefined;
  json(body: unknown): unknown;
}

const RETRY_AFTER_HEADER = 'Retry-After';
/** Профиль: `Retry-After` — целое число секунд от 1 до 3600. */
const RETRY_AFTER_MIN_SEC = 1;
const RETRY_AFTER_MAX_SEC = 3600;
/** Окно троттлера (login-throttle.ts) — подсказка, если сам троттлер её не дал. */
const RETRY_AFTER_FALLBACK_SEC = 60;

function setNoStoreHeaders(res: NativeResponseLike): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

function retryAfterSeconds(res: NativeResponseLike): number {
  const raw = res.getHeader(RETRY_AFTER_HEADER);
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  const seconds = Number.isFinite(parsed) ? parsed : RETRY_AFTER_FALLBACK_SEC;
  return Math.min(RETRY_AFTER_MAX_SEC, Math.max(RETRY_AFTER_MIN_SEC, seconds));
}

export function sendNativeError(res: NativeResponseLike, code: NativeErrorCode): void {
  const status = NATIVE_ERROR_STATUS[code];
  setNoStoreHeaders(res);
  if (status === Number(HttpStatus.UNAUTHORIZED)) {
    res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
  }
  if (status === Number(HttpStatus.TOO_MANY_REQUESTS)) {
    res.setHeader(RETRY_AFTER_HEADER, retryAfterSeconds(res));
  }
  res.status(status).json({ error: code });
}

/** Заголовки успеха ставятся до обработчика: ответ без тела (`revoke`) тоже
 * обязан нести `no-store`, а Nest отправит его без участия контроллера. */
@Injectable()
export class NativeNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    setNoStoreHeaders(context.switchToHttp().getResponse<NativeResponseLike>());
    return next.handle();
  }
}
