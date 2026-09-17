import { describe, expect, it } from 'vitest';
import { ROLE_LABELS, USER_ROLES, USER_STATUSES, type UserStatus } from './auth';

describe('ROLE_LABELS', () => {
  it('у каждой роли из USER_ROLES есть подпись, и лишних подписей нет', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...USER_ROLES].sort());
  });

  it('каждая подпись — непустая строка', () => {
    for (const role of USER_ROLES) {
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });
});

describe('USER_STATUSES', () => {
  it('только active и blocked — статуса invited больше нет (ADR-0036, инцидент 2026-09-15)', () => {
    expect(USER_STATUSES).toEqual(['active', 'blocked']);
  });

  it('тип UserStatus не пропускает invited — расхождение с контрактом /auth/me ловит tsc', () => {
    // @ts-expect-error — статуса invited больше нет (ADR-0036, инцидент 2026-09-15)
    const status: UserStatus = 'invited';
    expect(status).toBe('invited');
  });
});
