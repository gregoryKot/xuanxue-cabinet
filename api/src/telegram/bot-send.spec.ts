// Чистая проверка сборки запроса — без сети (CLAUDE.md «Тесты»): подменён
// bot.telegram.callApi, реального Telegraf не создаём.
import type { Telegraf } from 'telegraf';
import { sendBotMessage } from './bot-send';

function fakeBot(): { bot: Telegraf; calls: [string, Record<string, unknown>][] } {
  const calls: [string, Record<string, unknown>][] = [];
  const bot = {
    telegram: {
      callApi: (method: string, payload: Record<string, unknown>) => {
        calls.push([method, payload]);
        return Promise.resolve(true);
      },
    },
  } as unknown as Telegraf;
  return { bot, calls };
}

describe('sendBotMessage', () => {
  it('без кнопок — chat_id/text, без reply_markup', async () => {
    const { bot, calls } = fakeBot();

    await sendBotMessage(bot, '111', 'Привет');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('sendMessage');
    expect(calls[0]?.[1]).toEqual({ chat_id: '111', text: 'Привет' });
  });

  it('с кнопками — reply_markup.inline_keyboard', async () => {
    const { bot, calls } = fakeBot();
    const buttons = [[{ text: 'Отменить', callback_data: 'cancel:1' }]];

    await sendBotMessage(bot, '111', 'Привет', buttons);

    expect(calls[0]?.[1]).toEqual({
      chat_id: '111',
      text: 'Привет',
      reply_markup: { inline_keyboard: buttons },
    });
  });
});
