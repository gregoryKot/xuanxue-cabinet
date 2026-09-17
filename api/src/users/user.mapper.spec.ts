// Юнит без Mongo и DI (CLAUDE.md «Тесты»: чистая логика — подстановка полей).
// Отдельно проверяет, что ПДн (telegramId, email, googleId) не попадают в
// UserDto ни в каком виде — единственная линия защиты помимо e2e (SECURITY §1).
import type { UserLean } from './users.service';
import { toUserDto } from './user.mapper';

const BASE: UserLean = {
  id: 'u1',
  name: 'Гриша',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};

describe('toUserDto', () => {
  it('маппит id, name, roles, status как есть', () => {
    const dto = toUserDto(BASE);
    expect(dto).toMatchObject({
      id: 'u1',
      name: 'Гриша',
      roles: ['teacher'],
      status: 'active',
    });
  });

  it('hasTelegram: true при заданном telegramId', () => {
    const dto = toUserDto({ ...BASE, telegramId: 555 });
    expect(dto.hasTelegram).toBe(true);
  });

  it('hasTelegram: false без telegramId', () => {
    const dto = toUserDto(BASE);
    expect(dto.hasTelegram).toBe(false);
  });

  it('lastLoginAt: ISO-строка с Z при заданной дате', () => {
    const dto = toUserDto({ ...BASE, lastLoginAt: new Date('2026-09-05T10:00:00Z') });
    expect(dto.lastLoginAt).toBe('2026-09-05T10:00:00.000Z');
  });

  it('lastLoginAt: поле отсутствует без даты входа', () => {
    const dto = toUserDto(BASE);
    expect(dto.lastLoginAt).toBeUndefined();
  });

  it('telegramId/email/googleId не попадают в результат ни в каком виде', () => {
    const dto = toUserDto({
      ...BASE,
      telegramId: 555,
      email: 'grisha@example.com',
      googleId: 'g-1',
    });
    expect(Object.keys(dto).sort()).toEqual(
      [
        'id',
        'name',
        'roles',
        'status',
        'hasTelegram',
        'lastLoginAt',
        'joinedViaInvite',
      ].sort(),
    );
  });

  it('joinedViaInvite: true при заданном joinedViaInviteAt (ADR-0030)', () => {
    const dto = toUserDto({
      ...BASE,
      joinedViaInviteAt: new Date('2026-09-15T10:00:00Z'),
    });
    expect(dto.joinedViaInvite).toBe(true);
  });

  it('joinedViaInvite: false без joinedViaInviteAt', () => {
    const dto = toUserDto(BASE);
    expect(dto.joinedViaInvite).toBe(false);
  });
});
