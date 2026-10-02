// Без сети (CLAUDE.md «Тесты»): `botInfo` выставляется заранее, чтобы
// handleUpdate не звал getMe; хендлер — вечный промис, время — fake timers.
import { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';
import { TELEGRAF_HANDLER_TIMEOUT_MS } from '../channels/telegram-client';
import { createTelegraf } from './telegraf-instance';

const UPDATE: Update = {
  update_id: 1,
  message: {
    message_id: 1,
    date: 1,
    chat: { id: 1, type: 'private', first_name: 'A' },
    from: { id: 1, is_bot: false, first_name: 'A' },
    text: 'x',
  },
};

function hangingBot(): { bot: Telegraf; caught: jest.Mock<void, [unknown]> } {
  const bot = createTelegraf('123456:fake-token-not-real');
  bot.botInfo = {
    id: 1,
    is_bot: true,
    first_name: 'b',
    username: 'b',
    can_join_groups: true,
    can_read_all_group_messages: false,
    supports_inline_queries: false,
  };
  const caught = jest.fn<void, [unknown]>();
  bot.use(() => new Promise<void>(() => undefined));
  bot.catch(caught);
  return { bot, caught };
}

describe('createTelegraf', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('создаёт Telegraf-инстанс с переданным токеном, не трогая сеть', () => {
    const bot = createTelegraf('123456:fake-token-not-real');
    expect(bot).toBeInstanceOf(Telegraf);
  });

  // Аудит 2026-10-01, F52: дефолтные 90 с Telegraf при молчащем Telegram
  // держали каждый апдейт до полутора минут. Поведенческая проверка вместо
  // чтения приватного `bot.options`.
  it('хендлер, зависший на TELEGRAF_HANDLER_TIMEOUT_MS, обрывается TimeoutError', async () => {
    const { bot, caught } = hangingBot();

    const pending = bot.handleUpdate(UPDATE);
    await jest.advanceTimersByTimeAsync(TELEGRAF_HANDLER_TIMEOUT_MS);
    await pending;

    expect(caught).toHaveBeenCalledTimes(1);
    expect(caught.mock.calls[0]?.[0]).toMatchObject({ name: 'TimeoutError' });
  });

  it('за миллисекунду до порога хендлер ещё не оборван', async () => {
    const { bot, caught } = hangingBot();

    void bot.handleUpdate(UPDATE);
    await jest.advanceTimersByTimeAsync(TELEGRAF_HANDLER_TIMEOUT_MS - 1);

    expect(caught).not.toHaveBeenCalled();
  });
});
