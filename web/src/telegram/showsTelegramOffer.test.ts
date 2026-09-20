import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { showsTelegramOffer } from './showsTelegramOffer';

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

describe('showsTelegramOffer (ADR-0042)', () => {
  it('чата с ботом нет — предлагаем связать', () => {
    expect(showsTelegramOffer(makeMe())).toBe(true);
  });

  it('чат с ботом есть — предлагать нечего', () => {
    expect(showsTelegramOffer(makeMe({ botChatActive: true }))).toBe(false);
  });

  // ADR-0067: отметка гасит предложение даже там, где botChatActive само по
  // себе его бы ещё разрешало.
  it('отметка «у меня нет Telegram» стоит, чата с ботом тоже нет — предложения нет', () => {
    expect(showsTelegramOffer(makeMe({ noTelegram: true, botChatActive: false }))).toBe(
      false,
    );
  });

  // Тот самый случай из ADR-0042, ради которого предикат смотрит на
  // botChatActive: виджет Telegram даёт telegramLinked сразу, а чата нет — и
  // уведомления молча не доходят.
  it('вошёл виджетом Telegram, но боту не писал — всё равно предлагаем', () => {
    expect(showsTelegramOffer(makeMe({ telegramLinked: true }))).toBe(true);
  });

  it('сессия ещё грузится — молчим, а не мигаем кнопкой', () => {
    expect(showsTelegramOffer(null)).toBe(false);
  });
});
