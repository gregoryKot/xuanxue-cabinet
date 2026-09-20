import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { acceptsTelegramOffer } from './acceptsTelegramOffer';

function makeMe(overrides: Partial<MeDto> = {}): MeDto {
  return {
    id: 'u1',
    name: 'Дима',
    roles: [],
    status: 'active',
    telegramLinked: false,
    botChatActive: false,
    hasEmail: false,
    noTelegram: false,
    needsProfile: false,
    ...overrides,
  };
}

describe('acceptsTelegramOffer (ADR-0067)', () => {
  it('отметки нет — предлагаем связку', () => {
    expect(acceptsTelegramOffer(makeMe())).toBe(true);
  });

  it('отметка «у меня нет Telegram» стоит — не предлагаем', () => {
    expect(acceptsTelegramOffer(makeMe({ noTelegram: true }))).toBe(false);
  });

  it('сессия ещё грузится (null) — молчим, а не мигаем предложением', () => {
    expect(acceptsTelegramOffer(null)).toBe(false);
  });
});
