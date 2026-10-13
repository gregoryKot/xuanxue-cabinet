// Мера 1 против буферизации сырого тела до гвардов (SECURITY §4, ADR-0083).
// Предикаты сырого парсера (materials/material-file-body.ts,
// exam-images/exam-image-body.ts) отрабатывают в app.setup.ts ДО
// ThrottlerGuard и AuthGuard — они express-middleware, а не Nest-гварды, и
// не успевают отказать неавторизованному запросу раньше, чем парсер
// буферизует тело целиком (до MATERIAL_FILE_LIMITS.maxBytes = 30 МБ).
// verifyCookieHeader — синхронный разбор `Cookie:` и HMAC-проверка без
// обращения к БД (auth/auth.service.ts): предикат может проверить наличие
// пригодной сессии сам, тем же кодом, что и гвард.
//
// ЭТО НЕ АВТОРИЗАЦИЯ. Функция отвечает только «есть ли подписанная,
// непротухшая сессия» — не «можно ли этому человеку сюда». Роль и
// `blocked` по-прежнему проверяет только AuthGuard, из БД, после. Разойдись
// эта функция с гвардом — худшее следствие: отказ в буферизации тому, кому
// загрузка положена (виден сразу как баг), а не тихая дыра — разрешить
// доступ она не может, только отказать в буферизации.
import type { DateTime } from 'luxon';
import type { SessionVerifier } from '../auth/auth.service';
import { asSingleHeader } from './http-headers';
import type { IncomingRequestLike } from './raw-body-route';

/** `now` — параметром (Luxon), не `DateTime.utc()` внутри (CLAUDE.md
 * «Детерминизм»): вызывающий (предикат-фабрика) берёт момент сам на границе
 * запроса, тем же приёмом, что AuthGuard.canActivate. */
export function hasSignedSession(
  req: IncomingRequestLike,
  sessions: SessionVerifier,
  now: DateTime,
): boolean {
  return sessions.verifyCookieHeader(asSingleHeader(req.headers.cookie), now) !== null;
}
