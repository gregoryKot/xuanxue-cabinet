import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { hasRole } from './hasRole';

const me: MeDto = {
  id: 'u1',
  name: 'Маша',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  needsProfile: false,
};

describe('hasRole', () => {
  it('роль есть → true, нет → false', () => {
    expect(hasRole(me, 'teacher')).toBe(true);
    expect(hasRole(me, 'admin')).toBe(false);
  });

  it('сессия ещё не загружена (null) → false, без падения', () => {
    expect(hasRole(null, 'admin')).toBe(false);
  });
});
