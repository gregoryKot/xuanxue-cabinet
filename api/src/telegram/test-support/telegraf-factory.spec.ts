// Прямая проверка фейка (без сети, без Mongo) — сам он используется другими
// спеками не полностью: 'getMe'/'setWebhook'/'sendMessage' там есть, а
// сторонний метод bot.telegram.callApi ни один продуктовый код пока не зовёт.
import { createFakeTelegrafFactory } from './telegraf-factory';

describe('createFakeTelegrafFactory', () => {
  it('getMe — резолвит фейковый botInfo', async () => {
    const { factory } = createFakeTelegrafFactory();
    const bot = factory('123456:token');

    const info = await bot.telegram.callApi('getMe', {});

    expect(info).toMatchObject({ id: 1, is_bot: true });
  });

  it('setWebhook — записывает вызов, url не строкой не подставляется как есть', async () => {
    const { factory, webhookCalls } = createFakeTelegrafFactory();
    const bot = factory('123456:token');

    await bot.telegram.callApi('setWebhook', {
      url: 'https://xuanxue.su/api/telegram/webhook',
      secret_token: 's',
      allowed_updates: ['message', 'callback_query'],
    });

    expect(webhookCalls).toEqual([
      {
        url: 'https://xuanxue.su/api/telegram/webhook',
        secretToken: 's',
        allowedUpdates: ['message', 'callback_query'],
      },
    ]);
  });

  it('sendMessage — записывает вызов (chatId, text, клавиатура)', async () => {
    const { factory, sendMessageCalls } = createFakeTelegrafFactory();
    const bot = factory('123456:token');

    await bot.telegram.callApi('sendMessage', {
      chat_id: '111',
      text: 'Привет',
      reply_markup: {
        inline_keyboard: [[{ text: 'Отменить', callback_data: 'cancel:1' }]],
      },
    });

    expect(sendMessageCalls).toEqual([
      {
        chatId: '111',
        text: 'Привет',
        replyMarkup: {
          inline_keyboard: [[{ text: 'Отменить', callback_data: 'cancel:1' }]],
        },
      },
    ]);
  });

  it('sendMessage с failSendMessage — отклоняется', async () => {
    const { factory } = createFakeTelegrafFactory({ failSendMessage: true });
    const bot = factory('123456:token');

    await expect(
      bot.telegram.callApi('sendMessage', { chat_id: '1', text: 'x' }),
    ).rejects.toThrow('сеть недоступна');
  });

  it('editMessageText — попадает в editMessageCalls вместе с кнопками', async () => {
    const fake = createFakeTelegrafFactory();
    const bot = fake.factory('123456:token');

    await bot.telegram.callApi('editMessageText', {
      chat_id: '1',
      text: 'Шаг 2',
      reply_markup: { inline_keyboard: [] },
    });

    expect(fake.editMessageCalls).toEqual([
      { chatId: '1', text: 'Шаг 2', replyMarkup: { inline_keyboard: [] } },
    ]);
    expect(fake.sendMessageCalls).toEqual([]);
  });

  it('неизвестный метод — резолвится в undefined, не падает', async () => {
    const { factory } = createFakeTelegrafFactory();
    const bot = factory('123456:token');

    await expect(
      bot.telegram.callApi('getChat', { chat_id: '1' }),
    ).resolves.toBeUndefined();
  });
});
