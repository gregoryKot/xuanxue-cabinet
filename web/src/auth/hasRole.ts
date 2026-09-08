// Одна проверка роли для гвардов и экранов (CLAUDE.md «Одна механика — один
// компонент»): `me` бывает null, пока AuthProvider ещё грузит сессию, —
// в этот момент роли «нет», а не ошибка.
import type { MeDto, UserRole } from '@xuanxue/shared';

export function hasRole(me: MeDto | null, role: UserRole): boolean {
  return me !== null && me.roles.includes(role);
}
