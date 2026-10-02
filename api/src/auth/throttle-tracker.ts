// Ключ бакета троттлера (ADR-0164; CLAUDE.md, правило 4; SECURITY §7):
// вошедший считается по своей сессии, не по IP. До этого ThrottlerGuard
// бакетировал всех по `req.ip`, и ученики за одним Wi-Fi (NAT школы) делили
// 120 запросов в минуту на всех: в нагрузочном тесте аудита 2026-10-01 десять
// человек получали 429 на автосохранении ответов уже на 65-й секунде, а
// восемь — на картинках вариантов. Неверифицированное (нет cookie, битая
// подпись, протухший токен) по-прежнему считается по IP — это защита входов
// и публичных маршрутов от перебора, её не ослабляем. Подпись cookie
// проверяется тем же verifySession, что и в AuthGuard: иначе подделанная
// cookie давала бы свой бакет мимо лимита по IP.
import type { DateTime } from 'luxon';
import { asSingleHeader } from '../common/http-headers';
import { readCookie, SESSION_COOKIE } from './session-cookie';
import { verifySession } from './session-token';

/** Часть запроса Express, которая нужна ключу: IP (после `trust proxy` —
 * из `x-forwarded-for`) и заголовок Cookie. */
export interface ThrottleRequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export function throttleTracker(
  req: ThrottleRequestLike,
  secret: string,
  now: DateTime,
): string {
  const token = readCookie(asSingleHeader(req.headers?.cookie), SESSION_COOKIE);
  const payload = token ? verifySession(token, secret, now) : null;
  if (payload) return `user:${payload.sub}`;
  return `ip:${req.ip ?? 'unknown'}`;
}
