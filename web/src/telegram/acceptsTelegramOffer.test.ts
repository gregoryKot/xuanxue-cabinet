import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { acceptsTelegramOffer, showsTelegramLinkOffer } from './acceptsTelegramOffer';

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

describe('showsTelegramLinkOffer (ADR-0067)', () => {
  it('Telegram не ключ входа и отметки нет — связку предлагаем', () => {
    expect(showsTelegramLinkOffer(makeMe())).toBe(true);
  });

  it('отметка стоит — не предлагаем, даже пока Telegram не связан', () => {
    expect(showsTelegramLinkOffer(makeMe({ noTelegram: true }))).toBe(false);
  });

  it('Telegram уже ключ входа — связывать нечего', () => {
    expect(showsTelegramLinkOffer(makeMe({ telegramLinked: true }))).toBe(false);
  });

  // Чат с ботом — вопрос showsTelegramOffer, не этого предиката: у вошедшего
  // по почте связка нужна независимо от того, писал ли он боту.
  it('чат с ботом активен, а Telegram не связан — связку всё равно предлагаем', () => {
    expect(showsTelegramLinkOffer(makeMe({ botChatActive: true }))).toBe(true);
  });

  it('сессия ещё грузится (null) — молчим', () => {
    expect(showsTelegramLinkOffer(null)).toBe(false);
  });
});
