// Юнит-тест числа раздела «Оплаты» (CLAUDE.md «Тесты»: чистая логика — без
// Mongo и без DI), включая пустую базу и склонение — образец
// lesson-recording-summary.spec.ts.
import { describe, expect, it } from 'vitest';
import type { PaymentDto, PaymentStatus } from './payments';
import { formatPaymentsSummary, type PaymentsSummaryItem } from './payments-summary';

const MONTH = '2026-09';

function row(status: PaymentStatus, isReminded = false, index = 0): PaymentDto {
  return {
    userId: `user-${status}-${index}`,
    userName: `Ученик ${index}`,
    month: MONTH,
    status,
    ...(status === 'awaiting' ? { screenshotKind: 'upload' as const } : {}),
    ...(isReminded ? { reminderSentAt: '2026-09-10T08:00:00.000Z' } : {}),
  };
}

function rowsOf(count: number, status: PaymentStatus, isReminded = false): PaymentDto[] {
  return Array.from({ length: count }, (_, index) => row(status, isReminded, index));
}

function itemsOf(rows: PaymentDto[], month = MONTH): readonly PaymentsSummaryItem[] {
  const summary = formatPaymentsSummary({ month, rows });
  if (summary.isEmpty) throw new Error('ожидалось непустое число раздела');
  return summary.items;
}

function valuesOf(rows: PaymentDto[]): string[] {
  return itemsOf(rows).map((item) => item.value);
}

describe('formatPaymentsSummary', () => {
  it('пустая база — честное «пока нечего показать», не «0 из 0»', () => {
    expect(formatPaymentsSummary({ month: MONTH, rows: [] })).toEqual({
      heading: 'За сентябрь',
      isEmpty: true,
      emptyText: 'Пока нечего показать — в списке нет ни одного ученика.',
    });
  });

  it('четыре пункта в порядке «оплатили, ждут, без оплаты, напомнили»', () => {
    expect(itemsOf(rowsOf(1, 'paid')).map((item) => [item.key, item.caption])).toEqual([
      ['paid', 'Оплатили'],
      ['awaiting', 'Ждут подтверждения'],
      ['unpaid', 'Без оплаты'],
      ['reminded', 'Напомнили'],
    ]);
  });

  it('все оплатили — остальные пункты нулевыми словами, не «0 учеников»', () => {
    const items = itemsOf(rowsOf(12, 'paid'));
    expect(items.map((item) => item.count)).toEqual([12, 0, 0, 0]);
    expect(items.map((item) => item.value)).toEqual([
      '12 учеников',
      'никто',
      'никого',
      'никому',
    ]);
  });

  it('никто не оплатил и не ждёт — «пока никто» у оплативших', () => {
    expect(valuesOf(rowsOf(3, 'unpaid'))).toEqual([
      'пока никто',
      'никто',
      '3 ученика',
      'никому',
    ]);
  });

  it('смешанный месяц — напомнили пересекается со статусами', () => {
    const rows = [
      ...rowsOf(5, 'paid'),
      ...rowsOf(2, 'awaiting'),
      ...rowsOf(4, 'unpaid'),
      // Напоминание получили и те, кто не оплатил, и те, кто заплатил после него.
      ...rowsOf(3, 'unpaid', true),
      ...rowsOf(1, 'paid', true),
    ];
    const items = itemsOf(rows);
    expect(items.map((item) => item.count)).toEqual([6, 2, 7, 4]);
    expect(items.map((item) => item.value)).toEqual([
      '6 учеников',
      '2 ученика',
      '7 учеников',
      '4 ученикам',
    ]);
  });

  it.each([
    [1, '1 ученик', '1 ученику'],
    [2, '2 ученика', '2 ученикам'],
    [5, '5 учеников', '5 ученикам'],
    [11, '11 учеников', '11 ученикам'],
    [21, '21 ученик', '21 ученику'],
  ])(
    'склонение на %i: именительный «%s», дательный «%s»',
    (count, nominative, dative) => {
      const [paid, , , reminded] = valuesOf(rowsOf(count, 'paid', true));
      expect(paid).toBe(nominative);
      expect(reminded).toBe(dative);
    },
  );

  it('заголовок называет месяц страницы', () => {
    const summary = formatPaymentsSummary({ month: '2026-01', rows: [] });
    expect(summary.heading).toBe('За январь');
  });

  it('заголовок непустого числа тоже по месяцу страницы', () => {
    const summary = formatPaymentsSummary({ month: '2026-12', rows: rowsOf(1, 'paid') });
    expect(summary.heading).toBe('За декабрь');
  });

  it('в строках нет маркера **: shared уходит и в Telegram', () => {
    const summary = formatPaymentsSummary({
      month: MONTH,
      rows: rowsOf(2, 'paid', true),
    });
    expect(JSON.stringify(summary)).not.toContain('**');
  });
});
