import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { showsTelegramHint } from './showsTelegramHint';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: ['teacher'],
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: true,
    botChatActive: false,
    hasEmail: true,
    needsProfile: false,
    ...overrides,
  };
}

describe('showsTelegramHint (ADR-0042)', () => {
  it('учитель без активного чата — true', () => {
    expect(showsTelegramHint(makeMe({ roles: ['teacher'], botChatActive: false }))).toBe(
      true,
    );
  });

  it('учитель с активным чатом — false', () => {
    expect(showsTelegramHint(makeMe({ roles: ['teacher'], botChatActive: true }))).toBe(
      false,
    );
  });

  it('помощник учителя без чата — true, набор уведомлений тот же, что у учителя', () => {
    expect(
      showsTelegramHint(makeMe({ roles: ['assistant'], botChatActive: false })),
    ).toBe(true);
  });

  it('админ без чата — false: он не проверяет работы, вида attempt_submitted у него нет', () => {
    expect(showsTelegramHint(makeMe({ roles: ['admin'], botChatActive: false }))).toBe(
      false,
    );
  });

  it('ученик — без ролей штата, без чата — false', () => {
    expect(showsTelegramHint(makeMe({ roles: [], botChatActive: false }))).toBe(false);
  });

  it('сессия ещё не загружена (null) — false, без падения', () => {
    expect(showsTelegramHint(null)).toBe(false);
  });
});
