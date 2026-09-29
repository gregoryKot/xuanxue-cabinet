import { describe, expect, it } from 'vitest';
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';
import { applyUploadedPayment } from './applyUploadedPayment';

const awaiting: MyPaymentDto = {
  month: '2026-09',
  status: 'awaiting',
  hasScreenshot: true,
};

describe('applyUploadedPayment', () => {
  it('нет строки месяца — новая ложится первой, остальные на месте', () => {
    const august: MyPaymentDto = {
      month: '2026-08',
      status: 'paid',
      hasScreenshot: false,
    };
    const page: MyPaymentsPageDto = { month: '2026-09', rows: [august] };

    expect(applyUploadedPayment(page, awaiting)).toEqual({
      month: '2026-09',
      rows: [awaiting, august],
    });
  });

  it('строка месяца есть — заменяется на месте, порядок не меняется', () => {
    const unpaid: MyPaymentDto = {
      month: '2026-09',
      status: 'unpaid',
      hasScreenshot: false,
    };
    const august: MyPaymentDto = {
      month: '2026-08',
      status: 'paid',
      hasScreenshot: false,
    };
    const page: MyPaymentsPageDto = { month: '2026-09', rows: [unpaid, august] };

    expect(applyUploadedPayment(page, awaiting)?.rows).toEqual([awaiting, august]);
  });

  it('исходная страница не мутируется', () => {
    const page: MyPaymentsPageDto = { month: '2026-09', rows: [] };

    applyUploadedPayment(page, awaiting);

    expect(page.rows).toEqual([]);
  });

  it('страницы ещё нет — остаётся null, строку класть некуда', () => {
    expect(applyUploadedPayment(null, awaiting)).toBeNull();
  });
});
