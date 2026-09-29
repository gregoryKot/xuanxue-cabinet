import { DEFAULT_PAYMENT_REMINDER } from '@xuanxue/shared';
import { buildPaymentReminderText } from './payment-reminder-text';

const BASE = {
  template: DEFAULT_PAYMENT_REMINDER.template,
  name: 'Ваня',
  month: '2026-09',
};

describe('buildPaymentReminderText', () => {
  it('подставляет имя и месяц, ссылка — deep link pay_<месяц>', () => {
    const text = buildPaymentReminderText({ ...BASE, botUsername: 'xuanxue_bot' });

    expect(text).toContain('Ваня, абонемент за сентябрь 2026 пока не отмечен');
    expect(text.endsWith(' https://t.me/xuanxue_bot?start=pay_2026-09')).toBe(true);
  });

  it('нет имени бота — ссылка исчезает вместе с пробелом перед ней', () => {
    const text = buildPaymentReminderText(BASE);

    expect(text.endsWith('и мы отметим.')).toBe(true);
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
