// Прямая проверка фейка (без сети, без Mongo) — сам он используется другими
// спеками не полностью: 'getMe'/'setWebhook' там есть, а сторонний метод
// bot.telegram.callApi ни один продуктовый код пока не зовёт.
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
    });

    expect(webhookCalls).toEqual([
      { url: 'https://xuanxue.su/api/telegram/webhook', secretToken: 's' },
    ]);
  });

  it('неизвестный метод — резолвится в undefined, не падает', async () => {
    const { factory } = createFakeTelegrafFactory();
    const bot = factory('123456:token');

    await expect(
      bot.telegram.callApi('sendMessage', { chat_id: '1', text: 'x' }),
    ).resolves.toBeUndefined();
  });
});
