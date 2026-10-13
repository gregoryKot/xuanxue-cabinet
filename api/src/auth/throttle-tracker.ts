// Ключ бакета троттлера (ADR-0164; CLAUDE.md, правило 4; SECURITY §7):
// вошедший считается по своей сессии, не по IP. До этого ThrottlerGuard
// бакетировал всех по `req.ip`, и ученики за одним Wi-Fi (NAT школы) делили
// 120 запросов в минуту на всех: в нагрузочном тесте аудита 2026-10-01 десять
// человек получали 429 на автосохранении ответов уже на 65-й секунде, а
// восемь — на картинках вариантов. Неверифицированное (нет cookie, битая
// подпись, протухший токен, две одноимённые cookie) по-прежнему считается по
// IP — это защита входов и публичных маршрутов от перебора, её не ослабляем.
// Сессию проверяет тот же AuthService.verifyCookieHeader, что и AuthGuard:
// иначе подделанная cookie давала бы свой бакет мимо лимита по IP.
import type { DateTime } from 'luxon';
import { asSingleHeader } from '../common/http-headers';
import type { SessionVerifier } from './auth.service';

/** Часть запроса Express, которая нужна ключу: IP (после `trust proxy` —
 * из `x-forwarded-for`) и заголовок Cookie. */
export interface ThrottleRequestLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export function throttleTracker(
  req: ThrottleRequestLike,
  sessions: SessionVerifier,
  now: DateTime,
): string {
  const payload = sessions.verifyCookieHeader(asSingleHeader(req.headers?.cookie), now);
  if (payload) return `user:${payload.sub}`;
  return `ip:${req.ip ?? 'unknown'}`;
}
