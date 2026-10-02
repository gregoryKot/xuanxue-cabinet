import { DEFAULT_PAYMENT_REMINDER } from '@xuanxue/shared';
import { buildPaymentReminderText } from './payment-reminder-text';

const BASE = {
  template: DEFAULT_PAYMENT_REMINDER.template,
  name: 'Ваня',
  month: '2026-09',
  contact: 'Маше Вязовой — например, в Telegram @marievyazova',
};

describe('buildPaymentReminderText', () => {
  it('по умолчанию — имя, месяц и контакт бухгалтера, без ссылки на бота (ADR-0159)', () => {
    const text = buildPaymentReminderText({ ...BASE, botUsername: 'xuanxue_bot' });

    expect(text).toBe(
      'Ваня, напоминаем об оплате за сентябрь 2026.\nСкриншот об оплате отправьте Маше Вязовой — например, в Telegram @marievyazova.',
    );
  });

  it('{ссылка} в своём шаблоне — deep link pay_<месяц>', () => {
    const template = 'Пришлите боту:[ {ссылка}]';

    expect(
      buildPaymentReminderText({ ...BASE, template, botUsername: 'xuanxue_bot' }),
    ).toBe('Пришлите боту: https://t.me/xuanxue_bot?start=pay_2026-09');
  });

  it('нет имени бота — ссылка исчезает вместе с пробелом перед ней', () => {
    const template = 'Пришлите {контакт}.[ {ссылка}]';
    const text = buildPaymentReminderText({ ...BASE, template });

    expect(text).toBe('Пришлите Маше Вязовой — например, в Telegram @marievyazova.');
    expect(text).not.toContain('t.me');
  });

  it('{сумма} — форматированная сумма; нет суммы — пусто', () => {
    const template = 'К оплате[ {сумма}] за {месяц}.';

    expect(buildPaymentReminderText({ ...BASE, template, amountMinor: 25050 })).toBe(
      'К оплате 250,50 ₪ за сентябрь 2026.',
    );
    expect(buildPaymentReminderText({ ...BASE, template })).toBe(
      'К оплате за сентябрь 2026.',
    );
  });
});
