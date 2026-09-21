// Чистая проверка сборки запроса — без сети (CLAUDE.md «Тесты»): подменён
// bot.telegram.callApi (test-support/fake-call-api-bot.ts), реального
// Telegraf не создаём.
import { sendBotMessage } from './bot-send';
import { fakeCallApiBot } from './test-support/fake-call-api-bot';

describe('sendBotMessage', () => {
  it('без кнопок — chat_id/text, без reply_markup', async () => {
    const { bot, calls } = fakeCallApiBot();

    await sendBotMessage(bot, '111', 'Привет');

    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('sendMessage');
    expect(calls[0]?.[1]).toEqual({ chat_id: '111', text: 'Привет' });
  });

  it('с кнопками — reply_markup.inline_keyboard', async () => {
    const { bot, calls } = fakeCallApiBot();
    const buttons = [[{ text: 'Отменить', callback_data: 'cancel:1' }]];

    await sendBotMessage(bot, '111', 'Привет', buttons);

    expect(calls[0]?.[1]).toEqual({
      chat_id: '111',
      text: 'Привет',
      reply_markup: { inline_keyboard: buttons },
    });
  });
});
