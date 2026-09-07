import { Telegraf } from 'telegraf';
import { createTelegraf } from './telegraf-instance';

describe('createTelegraf', () => {
  it('создаёт Telegraf-инстанс с переданным токеном, не трогая сеть', () => {
    const bot = createTelegraf('123456:fake-token-not-real');
    expect(bot).toBeInstanceOf(Telegraf);
  });
});
