// Чистая логика момента отправки — без Mongo (CLAUDE.md «Тесты»). Пояс школы
// всегда явный, поэтому тест не зависит от пояса машины: CI гоняет его и под
// TZ=Australia/Sydney.
import { DateTime } from 'luxon';
import type { PaymentReminderSettings } from '@xuanxue/shared';
import {
  isPaymentReminderDue,
  paymentReminderDueAt,
  PAYMENT_REMINDER_CATCH_UP_HOURS,
} from './payment-reminder-due';

const TZ = 'Asia/Jerusalem';

function utc(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' });
}

function reminder(
  overrides: Partial<PaymentReminderSettings> = {},
): PaymentReminderSettings {
  return { enabled: true, dayOfMonth: 5, time: '10:00', template: 'x', ...overrides };
}

describe('paymentReminderDueAt', () => {
  it('31-е в феврале 2026 (не високосный) — 28 февраля', () => {
    const due = paymentReminderDueAt(utc('2026-02-10T00:00:00Z'), TZ, 31, '10:00');

    expect(due.toFormat('yyyy-MM-dd HH:mm')).toBe('2026-02-28 10:00');
  });

  it('31-е в апреле — 30 апреля', () => {
    const due = paymentReminderDueAt(utc('2026-04-10T00:00:00Z'), TZ, 31, '10:00');

    expect(due.toFormat('yyyy-MM-dd')).toBe('2026-04-30');
  });

  it('29 февраля 2028 (високосный) — 29-е существует, не сдвигается', () => {
    const due = paymentReminderDueAt(utc('2028-02-10T00:00:00Z'), TZ, 29, '10:00');

    expect(due.toFormat('yyyy-MM-dd')).toBe('2028-02-29');
  });

  it('месяц берётся по часам школы, не по UTC: 31 августа 22:30Z — уже 1 сентября в Израиле', () => {
    const due = paymentReminderDueAt(utc('2026-08-31T22:30:00Z'), TZ, 5, '10:00');

    expect(due.toFormat('yyyy-MM-dd')).toBe('2026-09-05');
  });

  // Переход на летнее время в Израиле 2026 — пятница 27 марта, 02:00.
  it('переход на летнее время: 10:00 по часам школы остаётся 10:00, смещение меняется', () => {
    const winter = paymentReminderDueAt(utc('2026-02-01T00:00:00Z'), TZ, 27, '10:00');
    const summer = paymentReminderDueAt(utc('2026-03-30T00:00:00Z'), TZ, 27, '10:00');

    expect(winter.toUTC().toISO()).toBe('2026-02-27T08:00:00.000Z');
    expect(summer.toUTC().toISO()).toBe('2026-03-27T07:00:00.000Z');
    expect(summer.toFormat('HH:mm')).toBe('10:00');
  });

  it('обратный переход 25 октября 2026: 10:00 снова 08:00Z, минута по часам школы не сдвинута', () => {
    const before = paymentReminderDueAt(utc('2026-10-01T00:00:00Z'), TZ, 24, '10:00');
    const after = paymentReminderDueAt(utc('2026-10-30T00:00:00Z'), TZ, 26, '10:00');

    expect(before.toUTC().toISO()).toBe('2026-10-24T07:00:00.000Z');
    expect(after.toUTC().toISO()).toBe('2026-10-26T08:00:00.000Z');
    expect(after.toFormat('HH:mm')).toBe('10:00');
  });

  it('в сам день перехода вперёд 27 марта: 10:00 — уже летнее, 07:00Z', () => {
    const due = paymentReminderDueAt(utc('2026-03-27T00:00:00Z'), TZ, 27, '10:00');

    expect(due.toUTC().toISO()).toBe('2026-03-27T07:00:00.000Z');
  });
});

describe('isPaymentReminderDue', () => {
  // 5 сентября 2026, 10:00 в Израиле (UTC+3) = 07:00Z.
  const DUE = utc('2026-09-05T07:00:00Z');

  it('минута до момента — рано', () => {
    expect(isPaymentReminderDue(DUE.minus({ minutes: 1 }), TZ, reminder())).toBe(false);
  });

  it('ровно в момент — пора', () => {
    expect(isPaymentReminderDue(DUE, TZ, reminder())).toBe(true);
  });

  it('через 23:59 после момента — ещё в окне (пропущенные тики догоняются)', () => {
    const now = DUE.plus({ hours: 23, minutes: 59 });

    expect(isPaymentReminderDue(now, TZ, reminder())).toBe(true);
  });

  it('через 24:00 — окно закрыто', () => {
    const now = DUE.plus({ hours: PAYMENT_REMINDER_CATCH_UP_HOURS });

    expect(isPaymentReminderDue(now, TZ, reminder())).toBe(false);
  });

  it('включили 20-го при дне 5 — всем сразу не уходит: это прошлое напоминание', () => {
    expect(isPaymentReminderDue(utc('2026-09-20T07:00:00Z'), TZ, reminder())).toBe(false);
  });

  it('enabled: false — никогда', () => {
    expect(isPaymentReminderDue(DUE, TZ, reminder({ enabled: false }))).toBe(false);
  });

  it('31-е в феврале срабатывает 28-го и не срабатывает 27-го', () => {
    const settings = reminder({ dayOfMonth: 31 });
    // 10:00 по Израилю зимой (UTC+2) = 08:00Z.
    expect(isPaymentReminderDue(utc('2026-02-28T08:00:00Z'), TZ, settings)).toBe(true);
    expect(isPaymentReminderDue(utc('2026-02-27T08:00:00Z'), TZ, settings)).toBe(false);
  });

  it('переход на летнее время: 27 марта в 06:59Z рано, в 07:00Z пора', () => {
    const settings = reminder({ dayOfMonth: 27 });

    expect(isPaymentReminderDue(utc('2026-03-27T06:59:00Z'), TZ, settings)).toBe(false);
    expect(isPaymentReminderDue(utc('2026-03-27T07:00:00Z'), TZ, settings)).toBe(true);
  });
});
