import { describe, expect, it, vi } from 'vitest';
import type { MyPaymentDto, MyPaymentsPageDto } from '@xuanxue/shared';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { myPaymentLines, paymentStatusText } from './myPaymentLines';

stubViewerTimeZone('Europe/Moscow');

const PAID: MyPaymentDto = {
  month: '2026-09',
  status: 'paid',
  confirmedAt: '2026-09-15T10:00:00.000Z',
  hasScreenshot: true,
};
const AWAITING: MyPaymentDto = {
  month: '2026-09',
  status: 'awaiting',
  hasScreenshot: true,
};
const UNPAID: MyPaymentDto = { month: '2026-09', status: 'unpaid', hasScreenshot: false };

describe('paymentStatusText', () => {
  it('оплачено — с датой подтверждения в родительном падеже', () => {
    expect(paymentStatusText('2026-09', PAID)).toBe('Оплачено 15 сентября');
  });

  it('оплачено без даты — просто «Оплачено»', () => {
    const withoutDate: MyPaymentDto = {
      month: '2026-09',
      status: 'paid',
      hasScreenshot: false,
    };
    expect(paymentStatusText('2026-09', withoutDate)).toBe('Оплачено');
  });

  it('ждём подтверждения', () => {
    expect(paymentStatusText('2026-09', AWAITING)).toBe('Ждём подтверждения');
  });

  it('не оплачено и нет строки — одна и та же фраза с названием месяца', () => {
    expect(paymentStatusText('2026-09', UNPAID)).toBe('Оплаты за сентябрь нет');
    expect(paymentStatusText('2026-09', undefined)).toBe('Оплаты за сентябрь нет');
  });

  describe('граница суток', () => {
    // 30 сентября 22:30 UTC: в Москве (+3) уже 1 октября 01:30, в UTC ещё 30-е.
    const boundary: MyPaymentDto = { ...PAID, confirmedAt: '2026-09-30T22:30:00.000Z' };

    it('день считается по часам зрителя: Москва — 1 октября', () => {
      expect(paymentStatusText('2026-09', boundary)).toBe('Оплачено 1 октября');
    });
  });
});

describe('paymentStatusText — пояс зрителя UTC', () => {
  stubViewerTimeZone('UTC');

  it('то же мгновение у зрителя в UTC — ещё 30 сентября', () => {
    const boundary: MyPaymentDto = { ...PAID, confirmedAt: '2026-09-30T22:30:00.000Z' };
    expect(paymentStatusText('2026-09', boundary)).toBe('Оплачено 30 сентября');
  });
});

describe('myPaymentLines', () => {
  it('current без строки — «Оплаты за месяц нет», скриншот можно прислать', () => {
    const { current, others } = myPaymentLines({
      month: '2026-09',
      rows: [],
      contact: 'Маше Вязовой — например, в Telegram @marievyazova',
    });

    expect(current).toEqual({
      month: '2026-09',
      title: 'Сентябрь 2026',
      status: 'unpaid',
      text: 'Оплаты за сентябрь нет',
      canSendScreenshot: true,
    });
    expect(others).toEqual([]);
  });

  it('оплаченный месяц — действия нет', () => {
    const { current } = myPaymentLines({
      month: '2026-09',
      rows: [PAID],
      contact: 'Маше Вязовой — например, в Telegram @marievyazova',
    });

    expect(current.status).toBe('paid');
    expect(current.canSendScreenshot).toBe(false);
  });

  it('ждёт подтверждения — скриншот можно прислать ещё раз', () => {
    const { current } = myPaymentLines({
      month: '2026-09',
      rows: [AWAITING],
      contact: 'Маше Вязовой — например, в Telegram @marievyazova',
    });

    expect(current.text).toBe('Ждём подтверждения');
    expect(current.canSendScreenshot).toBe(true);
  });

  it('остальные месяцы — в порядке сервера, без текущего', () => {
    const page: MyPaymentsPageDto = {
      month: '2026-09',
      contact: 'Маше Вязовой — например, в Telegram @marievyazova',
      rows: [
        AWAITING,
        { ...PAID, month: '2026-08', confirmedAt: '2026-08-04T09:00:00.000Z' },
        { ...UNPAID, month: '2026-07' },
      ],
    };

    const { current, others } = myPaymentLines(page);

    expect(current.month).toBe('2026-09');
    expect(others.map((line) => [line.title, line.text])).toEqual([
      ['Август 2026', 'Оплачено 4 августа'],
      ['Июль 2026', 'Оплаты за июль нет'],
    ]);
  });

  it('текущий месяц берётся у сервера, а не по часам зрителя', () => {
    // В Сиднее уже 1 октября, сервер (пояс школы) ещё считает сентябрь.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T15:30:00.000Z'));
    try {
      const { current } = myPaymentLines({
        month: '2026-09',
        rows: [],
        contact: 'Маше Вязовой — например, в Telegram @marievyazova',
      });
      expect(current.month).toBe('2026-09');
      expect(current.title).toBe('Сентябрь 2026');
    } finally {
      vi.useRealTimers();
    }
  });
});
