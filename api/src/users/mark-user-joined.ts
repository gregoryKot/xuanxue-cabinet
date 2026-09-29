// Отметить нового человека вошедшим по ссылке-приглашению (ADR-0030/0036) —
// раньше была приватным методом LoginIdentityService, вынесена отдельно: тот
// же код нужен и GoogleLoginIdentityService (CLAUDE.md «Дубли»). Запись —
// UsersService.markJoinedViaInvite (mark-joined-via-invite.ts), здесь только
// склейка со свежим значением поля в возвращаемом UserLean — второй поход в
// базу за тем же документом не нужен.
import type { DateTime } from 'luxon';
import type { UserLean, UsersService } from './users.service';

export async function markUserJoined(
  usersService: UsersService,
  user: UserLean,
  now: DateTime,
): Promise<UserLean> {
  await usersService.markJoinedViaInvite(user.id, now);
  return { ...user, joinedViaInviteAt: now.toJSDate() };
}
