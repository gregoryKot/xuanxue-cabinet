// Читает пользователя текущей сессии из заголовка `Cookie` — та же пара
// шагов, что делает AuthGuard (verifyCookieHeader → findById), но
// без решения о доступе: AuthGuard сразу превращает отсутствие/протухшесть в
// 401, а вызывающему коду здесь (GoogleAuthService, ADR-0145) нужен сам факт
// «есть ли сессия и чья» — что с этим делать (редирект на /login у `start`,
// 401/403 у `POST`), решает он сам. Один код на оба места (CLAUDE.md «Дубли»).
// Роли здесь настоящие, без `actingUser` (ADR-0163): вызывающему нужны `id` и
// `status`, решения по ролям он не принимает.
import type { DateTime } from 'luxon';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';

export async function findSessionUser(
  cookieHeader: string | undefined,
  authService: AuthService,
  usersService: UsersService,
  now: DateTime,
): Promise<UserLean | null> {
  const payload = authService.verifyCookieHeader(cookieHeader, now);
  if (!payload) return null;
  return usersService.findById(payload.sub);
}
