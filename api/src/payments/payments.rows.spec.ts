// Юнит без Mongo (CLAUDE.md «Тесты»): строка на каждого активного ученика,
// фильтр по статусу и лимит — после сборки (docs/PLAN.md §15, ADR-0049).
import {
  buildPaymentRows,
  unpaidDto,
  type ActiveStudent,
  type PaymentRowData,
} from './payments.rows';

const STUDENTS: ActiveStudent[] = [
  { id: 'u1', name: 'Аня' },
  { id: 'u2', name: 'Борис' },
  { id: 'u3', name: 'Вера' },
];

describe('buildPaymentRows', () => {
  it('строка на каждого активного ученика, даже без документа', () => {
    const rows = buildPaymentRows(STUDENTS, new Map(), '2026-09', undefined, 50);

    expect(rows).toEqual([
      {
        userId: 'u1',
        userName: 'Аня',
        month: '2026-09',
        status: 'unpaid',
        hasScreenshot: false,
      },
      {
        userId: 'u2',
        userName: 'Борис',
        month: '2026-09',
        status: 'unpaid',
        hasScreenshot: false,
      },
      {
        userId: 'u3',
        userName: 'Вера',
        month: '2026-09',
        status: 'unpaid',
        hasScreenshot: false,
      },
    ]);
  });

  it('документ есть — статус и сумма из него, не «не оплачен»', () => {
    const payments = new Map<string, PaymentRowData>([
      [
        'u2',
        {
          status: 'paid',
          amountMinor: 25000,
          confirmedAt: '2026-09-05T10:00:00.000Z',
          hasScreenshot: false,
        },
      ],
    ]);

    const rows = buildPaymentRows(STUDENTS, payments, '2026-09', undefined, 50);

    expect(rows[1]).toEqual({
      userId: 'u2',
      userName: 'Борис',
      month: '2026-09',
      status: 'paid',
      amountMinor: 25000,
      confirmedAt: '2026-09-05T10:00:00.000Z',
      hasScreenshot: false,
      reminderSentAt: undefined,
    });
  });

  it('фильтр по статусу — применяется к уже собранным строкам', () => {
    const payments = new Map<string, PaymentRowData>([
      ['u1', { status: 'paid', hasScreenshot: false }],
    ]);

    const rows = buildPaymentRows(STUDENTS, payments, '2026-09', 'unpaid', 50);

    expect(rows.map((r) => r.userId)).toEqual(['u2', 'u3']);
  });

  it('лимит — после фильтра, не до него', () => {
    const rows = buildPaymentRows(STUDENTS, new Map(), '2026-09', undefined, 2);

    expect(rows).toHaveLength(2);
  });

  it('пустая школа — пустой список, не ошибка', () => {
    expect(buildPaymentRows([], new Map(), '2026-09', undefined, 50)).toEqual([]);
  });
});

describe('unpaidDto', () => {
  it('«не оплачен» без документа — сумма и подтверждение отсутствуют', () => {
    expect(unpaidDto({ id: 'u1', name: 'Аня' }, '2026-09')).toEqual({
      userId: 'u1',
      userName: 'Аня',
      month: '2026-09',
      status: 'unpaid',
      hasScreenshot: false,
    });
  });
});
