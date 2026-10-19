// Bearer приложения Daychi на маршрутах с @AllowNativeBearer() (ADR-0185).
// Всё, что гвард знает о нативном доступе, — здесь: есть ли заголовок и во что
// превращается исход проверки в ошибки кабинета. Сама проверка — единственная,
// NativeGrantsService.authenticate (срок, отзыв, человек, блокировка): второй
// копии правил входа нет. Нативные маршруты `/auth/native/*` отвечают своим
// форматом `{"error"}` (native-error.filter.ts), а маршрут кабинета с bearer —
// обычным конвертом ApiErrorBody, поэтому коды переводятся тут.
import { ACCESS_MESSAGE } from '@xuanxue/shared';
import type { DateTime } from 'luxon';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { RequestLike } from '../common/http-headers';
import { NativeAuthError } from '../native-auth/native-auth-error';
import { bearerTokenOf } from '../native-auth/native-http';
import type { NativeGrantsService } from '../native-auth/native-grants.service';
import type { UserLean } from '../users/users.service';

export const SESSION_MESSAGE = 'Войдите, чтобы продолжить.';

/** Заголовок есть, пусть и пустой или повторённый: даже негодный Authorization —
 * заявка на bearer, и тогда cookie её не заменяет. */
export function hasAuthorizationHeader(request: RequestLike): boolean {
  return request.headers.authorization !== undefined;
}

/** Человек по bearer запроса. Заблокированный — 403 (проверка блокировки идёт
 * после проверки токена, негодный токен её не раскрывает); любой другой отказ
 * нативной проверки — 401. Сбой базы и прочие ошибки идут дальше как есть — и
 * становятся 500. */
export async function authenticateBearer(
  grants: Pick<NativeGrantsService, 'authenticate'>,
  request: RequestLike,
  now: DateTime,
): Promise<UserLean> {
  try {
    const token = bearerTokenOf({
      headers: request.headers,
      rawHeaders: request.rawHeaders ?? [],
    });
    return (await grants.authenticate(token, now)).user;
  } catch (error) {
    if (!(error instanceof NativeAuthError)) throw error;
    if (error.code === 'account_blocked') throw new ForbiddenError(ACCESS_MESSAGE);
    throw new UnauthorizedError(SESSION_MESSAGE);
  }
}
