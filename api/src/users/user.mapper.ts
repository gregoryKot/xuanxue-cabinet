// Единственный маппер UserLean → UserDto (CLAUDE.md «API»): документ наружу
// не возвращается, ПДн (telegramId, email, googleId) сюда не попадают ни в
// каком виде (SECURITY §1) — покрыто e2e users.e2e-spec.ts.
import type { UserDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { UserLean } from './users.service';

export function toUserDto(user: UserLean): UserDto {
  return {
    id: user.id,
    name: user.name,
    roles: user.roles,
    status: user.status,
    hasTelegram: user.telegramId !== undefined,
    lastLoginAt: user.lastLoginAt ? toIsoUtc(user.lastLoginAt) : undefined,
  };
}
