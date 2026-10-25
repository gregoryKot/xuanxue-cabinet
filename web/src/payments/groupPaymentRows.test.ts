import { describe, expect, it } from 'vitest';
import type { PaymentDto, PaymentStatus } from '@xuanxue/shared';
import { groupPaymentRows } from './groupPaymentRows';

function row(userName: string, status: PaymentStatus): PaymentDto {
  return { userId: userName, userName, month: '2026-09', status };
}

describe('groupPaymentRows', () => {
  it('порядок групп: ждут подтверждения, оплатили, без оплаты', () => {
    const groups = groupPaymentRows([
      row('Аня', 'unpaid'),
      row('Боря', 'paid'),
      row('Вера', 'awaiting'),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      'Ждут подтверждения',
      'Оплатили',
      'Без оплаты',
    ]);
  });

  it('пустые группы не возвращаются', () => {
    const groups = groupPaymentRows([row('Аня', 'paid')]);

    expect(groups.map((group) => group.status)).toEqual(['paid']);
  });

  it('внутри группы порядок сервера сохраняется', () => {
    const groups = groupPaymentRows([
      row('Вера', 'unpaid'),
      row('Аня', 'paid'),
      row('Боря', 'unpaid'),
    ]);

    expect(groups[1]?.rows.map((r) => r.userName)).toEqual(['Вера', 'Боря']);
  });

  it('пустой список — нет групп', () => {
    expect(groupPaymentRows([])).toEqual([]);
  });
});
