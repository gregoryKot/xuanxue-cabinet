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
      telegramLinked: true,
    });
  });

  // Инцидент 2026-09-16 (RUNBOOK §8.17): вошедшего по почте бот не узнаёт, и
  // кабинет обязан это знать — иначе он зовёт его слать видео боту впустую.
  it('без telegramId — telegramLinked: false', () => {
    const emailOnly: UserLean = { ...fullUser(), telegramId: undefined };

    expect(toMeDto(emailOnly).telegramLinked).toBe(false);
  });

  // `status` наружу идёт (ADR-0026, ADR-0035: active/blocked, ждать больше
  // нечего); ключи входа не идут по-прежнему.
  it('не содержит email, telegramId, googleId', () => {
    const dto = toMeDto(fullUser()) as unknown as Record<string, unknown>;
    expect(dto.email).toBeUndefined();
    expect(dto.telegramId).toBeUndefined();
    expect(dto.googleId).toBeUndefined();
    expect(Object.keys(dto).sort()).toEqual([
      'id',
      'name',
      'roles',
      'status',
      'telegramLinked',
      'tz',
    ]);
  });
});
