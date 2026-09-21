// Мера 1 против буферизации сырого тела до гвардов (SECURITY §4, ADR-0081).
// Предикаты сырого парсера (materials/material-file-body.ts,
// exam-images/exam-image-body.ts) отрабатывают в app.setup.ts ДО
// ThrottlerGuard и AuthGuard — они express-middleware, а не Nest-гварды, и
// не успевают отказать неавторизованному запросу раньше, чем парсер
// буферизует тело целиком (до MATERIAL_FILE_LIMITS.maxBytes = 30 МБ).
// verifySession — синхронная HMAC-проверка без обращения к БД
// (auth/session-token.ts), readCookie — синхронный разбор заголовка
// `Cookie:` (auth/session-cookie.ts): предикат может проверить наличие
// пригодной сессии сам, тем же кодом, что и гвард.
//
// ЭТО НЕ АВТОРИЗАЦИЯ. Функция отвечает только «есть ли подписанная,
// непротухшая сессия» — не «можно ли этому человеку сюда». Роль и
// `blocked` по-прежнему проверяет только AuthGuard, из БД, после. Разойдись
// эта функция с гвардом — худшее следствие: отказ в буферизации тому, кому
// загрузка положена (виден сразу как баг), а не тихая дыра — разрешить
// доступ она не может, только отказать в буферизации.
import type { DateTime } from 'luxon';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { verifySession } from '../auth/session-token';
import { asSingleHeader } from './http-headers';
import type { IncomingRequestLike } from './raw-body-route';

/** `now` — параметром (Luxon), не `DateTime.utc()` внутри (CLAUDE.md
 * «Детерминизм»): вызывающий (предикат-фабрика) берёт момент сам на границе
 * запроса, тем же приёмом, что AuthGuard.canActivate. */
export function hasSignedSession(
  req: IncomingRequestLike,
  secret: string,
  now: DateTime,
): boolean {
  const token = readCookie(asSingleHeader(req.headers.cookie), SESSION_COOKIE);
  if (!token) return false;
  return verifySession(token, secret, now) !== null;
}
