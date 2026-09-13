import type { UserLean } from '../users/users.service';
import { toMeDto } from './user.mapper';

function fullUser(): UserLean {
  return {
    id: 'u1',
    name: 'Мария',
    email: 'maria@example.com',
    telegramId: 12345,
    googleId: 'g-1',
    roles: ['admin'],
    tz: 'Asia/Jerusalem',
    status: 'active',
    lastLoginAt: new Date('2026-09-05T00:00:00Z'),
  };
}

describe('toMeDto', () => {
  it('переносит id, name, roles, tz, status', () => {
    expect(toMeDto(fullUser())).toEqual({
      id: 'u1',
      name: 'Мария',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
      status: 'active',
    });
  });

  // `status` с ADR-0026 наружу идёт — по нему кабинет показывает экран
  // ожидания; ключи входа не идут по-прежнему.
  it('не содержит email, telegramId, googleId', () => {
    const dto = toMeDto(fullUser()) as unknown as Record<string, unknown>;
    expect(dto.email).toBeUndefined();
    expect(dto.telegramId).toBeUndefined();
    expect(dto.googleId).toBeUndefined();
    expect(Object.keys(dto).sort()).toEqual(['id', 'name', 'roles', 'status', 'tz']);
  });
});
