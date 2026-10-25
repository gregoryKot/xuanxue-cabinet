import { describe, expect, it } from 'vitest';
import type { PaymentDto } from '@xuanxue/shared';
import { paymentStatusText } from './paymentRowText';

function row(overrides: Partial<PaymentDto>): PaymentDto {
  return {
    userId: 'u1',
    userName: 'Аня',
    month: '2026-09',
    status: 'paid',
    ...overrides,
  };
}

const CONFIRMED_AT = '2026-09-15T10:00:00.000Z';
const TZ = 'Europe/Moscow';

describe('paymentStatusText', () => {
  it('оплачено с датой в поясе зрителя', () => {
    expect(paymentStatusText(row({ confirmedAt: CONFIRMED_AT }), TZ)).toBe(
      'Оплачено 15 сентября',
    );
  });

  it('вечер по UTC у зрителя впереди — уже следующий день', () => {
    const text = paymentStatusText(row({ confirmedAt: '2026-09-15T22:30:00.000Z' }), TZ);

    expect(text).toBe('Оплачено 16 сентября');
  });

  it('с суммой после даты', () => {
    const text = paymentStatusText(
      row({ confirmedAt: CONFIRMED_AT, amountMinor: 25000 }),
      TZ,
    );

    expect(text).toBe('Оплачено 15 сентября · 250 ₪');
  });

  it('оплачено без даты — просто «Оплачено»', () => {
    expect(paymentStatusText(row({}), TZ)).toBe('Оплачено');
  });

  it('оплачено без даты, но с суммой', () => {
    expect(paymentStatusText(row({ amountMinor: 25050 }), TZ)).toBe(
      'Оплачено · 250,50 ₪',
    );
  });

  it('ждёт подтверждения', () => {
    expect(paymentStatusText(row({ status: 'awaiting' }), TZ)).toBe(
      'Прислали снимок перевода',
    );
  });

  it('без оплаты', () => {
    expect(paymentStatusText(row({ status: 'unpaid' }), TZ)).toBe('Оплаты пока нет');
  });
});
