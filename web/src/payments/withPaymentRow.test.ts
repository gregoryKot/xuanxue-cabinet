import { describe, expect, it } from 'vitest';
import type { PaymentDto, PaymentsPageDto } from '@xuanxue/shared';
import { withPaymentRow } from './withPaymentRow';

function row(userId: string, overrides: Partial<PaymentDto> = {}): PaymentDto {
  return {
    userId,
    userName: `Ученик ${userId}`,
    month: '2026-09',
    status: 'unpaid',
    ...overrides,
  };
}

const page: PaymentsPageDto = { month: '2026-09', rows: [row('u1'), row('u2')] };

describe('withPaymentRow', () => {
  it('заменяет строку по userId и оставляет её место в списке', () => {
    const paid = row('u1', { status: 'paid' });

    const next = withPaymentRow(page, paid);

    expect(next?.rows).toEqual([paid, row('u2')]);
  });

  it('не меняет исходную страницу', () => {
    withPaymentRow(page, row('u1', { status: 'paid' }));

    expect(page.rows[0]?.status).toBe('unpaid');
  });

  it('ответ про другой месяц не попадает в открытый', () => {
    const next = withPaymentRow(page, row('u1', { month: '2026-08', status: 'paid' }));

    expect(next).toBe(page);
  });

  it('страницы ещё нет — остаётся null', () => {
    expect(withPaymentRow(null, row('u1'))).toBeNull();
  });

  it('незнакомый userId список не меняет по составу', () => {
    const next = withPaymentRow(page, row('u9', { status: 'paid' }));

    expect(next?.rows).toEqual(page.rows);
  });
});
