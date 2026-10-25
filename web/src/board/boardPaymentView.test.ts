// Карточка оплаты доски: три состояния месяца и контакт только при неоплате.
import { describe, expect, it } from 'vitest';
import type { MyPaymentsPageDto } from '@xuanxue/shared';
import { boardPaymentView } from './boardPaymentView';

const CONTACT = 'Маше Вязовой — например, в Telegram @marievyazova';

function makePage(rows: MyPaymentsPageDto['rows']): MyPaymentsPageDto {
  return { month: '2026-10', rows, contact: CONTACT };
}

describe('boardPaymentView', () => {
  it('строки месяца нет — «Оплаты за октябрь нет» и контакт', () => {
    expect(boardPaymentView(makePage([]))).toEqual({
      heading: 'Оплата за октябрь 2026',
      status: 'unpaid',
      statusText: 'Оплаты за октябрь нет',
      contact: CONTACT,
    });
  });

  it('ждём подтверждения — статус без контакта', () => {
    const view = boardPaymentView(
      makePage([{ month: '2026-10', status: 'awaiting', hasScreenshot: true }]),
    );
    expect(view.statusText).toBe('Ждём подтверждения');
    expect(view.contact).toBeNull();
  });

  it('оплачено — статус с датой и без контакта', () => {
    const view = boardPaymentView(
      makePage([
        {
          month: '2026-10',
          status: 'paid',
          confirmedAt: '2026-10-03T09:00:00.000Z',
          hasScreenshot: false,
        },
      ]),
    );
    expect(view.status).toBe('paid');
    expect(view.statusText).toBe('Оплачено 3 октября');
    expect(view.contact).toBeNull();
  });

  it('старые месяцы заголовок не меняют — он про месяц сервера', () => {
    const view = boardPaymentView(
      makePage([{ month: '2026-09', status: 'paid', hasScreenshot: false }]),
    );
    expect(view.heading).toBe('Оплата за октябрь 2026');
    expect(view.status).toBe('unpaid');
  });
});
