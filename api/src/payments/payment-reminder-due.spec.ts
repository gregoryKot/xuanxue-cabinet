// Чистая логика момента отправки — без Mongo (CLAUDE.md «Тесты»). Пояс школы
// всегда явный, поэтому тест не зависит от пояса машины: CI гоняет его и под
// TZ=Australia/Sydney.
import { DateTime } from 'luxon';
import {
  openReminderDays,
  paymentReminderDueAt,
  PAYMENT_REMINDER_CATCH_UP_HOURS,
} from './payment-reminder-due';

const TZ = 'Asia/Jerusalem';

function utc(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' });
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

describe('openReminderDays', () => {
  // 5 сентября 2026, 10:00 в Израиле (UTC+3) = 07:00Z.
  const DUE = utc('2026-09-05T07:00:00Z');

  function open(now: DateTime, time = '10:00'): number[] {
    return [...openReminderDays(now, TZ, time)].sort((a, b) => a - b);
  }

  it('минута до момента — 5-е ещё рано, открыто вчерашнее 4-е', () => {
    expect(open(DUE.minus({ minutes: 1 }))).toEqual([4]);
  });

  it('ровно в момент — открыто это число', () => {
    expect(open(DUE)).toEqual([5]);
  });

  it('через 23:59 после момента число ещё открыто (пропущенные тики догоняются)', () => {
    expect(open(DUE.plus({ hours: 23, minutes: 59 }))).toContain(5);
  });

  it('через 24:00 окно закрыто, открыто уже следующее число', () => {
    const now = DUE.plus({ hours: PAYMENT_REMINDER_CATCH_UP_HOURS });

    expect(open(now)).toEqual([6]);
  });

  it('окно через полночь: в 01:00 по Израилю вчерашнее число ещё открыто', () => {
    // 6 сентября 01:00 по часам школы = 5 сентября 22:00Z.
    expect(open(utc('2026-09-05T22:00:00Z'))).toEqual([5]);
  });

  it('пустой набор: 1-е число до 10:00, окно августа через границу месяца не перетекает', () => {
    // 1 сентября 00:30 по Израилю = 31 августа 21:30Z.
    expect(open(utc('2026-08-31T21:30:00Z'))).toEqual([]);
  });

  it('31-е в феврале 2026 (не високосный): 28-го открыты сразу 28, 29, 30 и 31', () => {
    // 10:00 по Израилю зимой (UTC+2) = 08:00Z.
    expect(open(utc('2026-02-28T08:00:00Z'))).toEqual([28, 29, 30, 31]);
    expect(open(utc('2026-02-27T08:00:00Z'))).toEqual([27]);
  });

  it('31-е в 30-дневном апреле: 30-го открыты 30 и 31', () => {
    expect(open(utc('2026-04-30T07:00:00Z'))).toEqual([30, 31]);
  });

  it('29 февраля 2028 (високосный): 29-го открыты 29, 30 и 31', () => {
    expect(open(utc('2028-02-29T08:00:00Z'))).toEqual([29, 30, 31]);
  });

  it('месяц берётся по часам школы, не по UTC: 31 августа 22:30Z — уже 1 сентября', () => {
    // По UTC ещё август, где 31-е открылось бы в 07:00Z; по часам школы — 1
    // сентября 01:30, до 10:00 не открыто ничего.
    expect(open(utc('2026-08-31T22:30:00Z'))).toEqual([]);
    expect(open(utc('2026-09-01T07:00:00Z'))).toEqual([1]);
  });

  // Переход на летнее время в Израиле 2026 — пятница 27 марта, 02:00.
  it('переход на летнее время: 27 марта в 06:59Z 27-е ещё закрыто, в 07:00Z открыто', () => {
    expect(open(utc('2026-03-27T06:59:00Z'))).toEqual([26]);
    // Окно 26-го — сутки реального времени от 08:00Z 26-го, поэтому оно
    // закрывается в 08:00Z 27-го (11:00 по летним часам), а не в 10:00: часы
    // школы за ночь ушли вперёд на час. Не потерянный и не двойной день:
    // человек с днём 26 получает раз, с днём 27 — раз.
    expect(open(utc('2026-03-27T07:00:00Z'))).toEqual([26, 27]);
    expect(open(utc('2026-03-27T08:00:00Z'))).toEqual([27]);
  });

  it('обратный переход 25 октября 2026: 10:00 остаётся 10:00, 26-е открывается в 08:00Z', () => {
    expect(open(utc('2026-10-26T07:59:00Z'))).toEqual([25]);
    expect(open(utc('2026-10-26T08:00:00Z'))).toEqual([26]);
  });

  it('окно 27 марта с 10:00 по часам школы длится 24 часа реального времени', () => {
    // Сутки от 07:00Z — до 07:00Z 28-го.
    expect(open(utc('2026-03-28T06:59:00Z'))).toContain(27);
    expect(open(utc('2026-03-28T07:00:00Z'))).toEqual([28]);
  });

  it('другой час школы: 18:30 открывает число в 18:30, а не в 10:00', () => {
    // 18:30 по Израилю (UTC+3) = 15:30Z.
    expect(open(utc('2026-09-05T15:29:00Z'), '18:30')).toEqual([4]);
    expect(open(utc('2026-09-05T15:30:00Z'), '18:30')).toEqual([5]);
  });
});
