import { describe, expect, it } from 'vitest';
import { paymentScreenshotRoute } from './paymentScreenshotRoute';

describe('paymentScreenshotRoute', () => {
  it('Telegram связан и имя бота известно — ссылка на бота с месяцем', () => {
    expect(
      paymentScreenshotRoute({ telegramLinked: true }, 'xuanxue_bot', '2026-09'),
    ).toEqual({
      kind: 'bot',
      href: 'https://t.me/xuanxue_bot?start=pay_2026-09',
    });
  });

  it('Telegram не связан — загрузка в кабинете, даже если бот настроен', () => {
    expect(
      paymentScreenshotRoute({ telegramLinked: false }, 'xuanxue_bot', '2026-09'),
    ).toEqual({
      kind: 'upload',
    });
  });

  it('Telegram связан, но имени бота нет — загрузка в кабинете', () => {
    expect(
      paymentScreenshotRoute({ telegramLinked: true }, undefined, '2026-09'),
    ).toEqual({
      kind: 'upload',
    });
  });
});
