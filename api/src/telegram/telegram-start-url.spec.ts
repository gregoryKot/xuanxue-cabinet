import { telegramStartUrl } from './telegram-start-url';

describe('telegramStartUrl', () => {
  it('собирает deep link на бота с payload', () => {
    expect(telegramStartUrl('xuanxue_bot', 'pay_2026-09')).toBe(
      'https://t.me/xuanxue_bot?start=pay_2026-09',
    );
  });
});
