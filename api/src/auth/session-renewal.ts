// Rolling-сессия (ADR-0012, SECURITY §2): токен живёт SESSION_MAX_AGE_DAYS с
// момента последней выдачи, но перевыпускается, если ему больше
// SESSION_RENEW_AFTER_DAYS — иначе активный пользователь доходит до
// абсолютного предела молча и получает 401 без предупреждения.
import { DateTime } from 'luxon';
import type { SessionPayload } from './session-token';

export const SESSION_RENEW_AFTER_DAYS = 7;

/** Чистая функция — без Date.now()/DateTime.utc() внутри (CLAUDE.md
 * «Время»): «сейчас» решает вызывающий гвард. */
export function shouldRenew(payload: SessionPayload, now: DateTime): boolean {
  const issuedAt = DateTime.fromSeconds(payload.iat, { zone: 'utc' });
  return now.diff(issuedAt, 'days').days > SESSION_RENEW_AFTER_DAYS;
}
