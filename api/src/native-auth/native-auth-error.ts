// Доменная ошибка нативных маршрутов (ADR-0181). Не наследует DomainError:
// у того коды из ApiErrorCode и конверт ApiErrorBody, а профиль Workshop 3c98d4a
// требует свой набор кодов и тело `{"error":"<код>"}`. Перевод в HTTP — только
// native-error.filter.ts.
import { HttpStatus } from '@nestjs/common';
import type { NativeErrorCode } from '@xuanxue/shared';

export const NATIVE_ERROR_STATUS: Record<NativeErrorCode, number> = {
  invalid_request: HttpStatus.BAD_REQUEST,
  invalid_client: HttpStatus.BAD_REQUEST,
  invalid_grant: HttpStatus.BAD_REQUEST,
  unsupported_grant_type: HttpStatus.BAD_REQUEST,
  invalid_token: HttpStatus.UNAUTHORIZED,
  account_blocked: HttpStatus.FORBIDDEN,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  temporarily_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  server_error: HttpStatus.INTERNAL_SERVER_ERROR,
};

export class NativeAuthError extends Error {
  constructor(readonly code: NativeErrorCode) {
    // Сообщение — сам код: ни токен, ни его хеш в текст ошибки не попадают.
    super(code);
    this.name = 'NativeAuthError';
  }
}
