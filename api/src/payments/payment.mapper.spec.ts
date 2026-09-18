// Юнит без Mongo (CLAUDE.md «Тесты») — toPaymentDto/toMyPaymentDto чистые
// функции. Обе стороны confirmedAt/reminderSentAt (со значением и без) —
// через confirm()/revoke() эту комбинацию не достать: `confirmedAt` у них
// всегда проставлен, `reminderSentAt` — слой 2.5 (следующий PR), поэтому
// прямой юнит-тест на маппер, а не через сервис.
import type { Types } from 'mongoose';
import { toMyPaymentDto, toPaymentDto, type RawLeanPayment } from './payment.mapper';

const BASE = {
  _id: 'p1' as unknown as Types.ObjectId,
  userId: 'u1' as unknown as Types.ObjectId,
  month: '2026-09',
  status: 'paid',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  updatedAt: new Date('2026-09-01T00:00:00Z'),
} as RawLeanPayment;

describe('toPaymentDto', () => {
  it('confirmedAt и reminderSentAt заданы — оба в ISO UTC с Z, скриншот есть', () => {
    const doc: RawLeanPayment = {
      ...BASE,
      confirmedAt: new Date('2026-09-05T10:00:00Z'),
      reminderSentAt: new Date('2026-09-10T08:00:00Z'),
      screenshotKind: 'telegram',
    };

    expect(toPaymentDto(doc, 'Ученик')).toEqual({
      userId: 'u1',
      userName: 'Ученик',
      month: '2026-09',
      status: 'paid',
      amountMinor: undefined,
      confirmedAt: '2026-09-05T10:00:00.000Z',
      hasScreenshot: true,
      reminderSentAt: '2026-09-10T08:00:00.000Z',
    });
  });

  it('confirmedAt и reminderSentAt не заданы — оба undefined, скриншота нет', () => {
    expect(toPaymentDto(BASE, 'Ученик')).toEqual({
      userId: 'u1',
      userName: 'Ученик',
      month: '2026-09',
      status: 'paid',
      amountMinor: undefined,
      confirmedAt: undefined,
      hasScreenshot: false,
      reminderSentAt: undefined,
    });
  });
});

describe('toMyPaymentDto', () => {
  it('confirmedAt задан — в ISO UTC с Z', () => {
    const doc: RawLeanPayment = {
      ...BASE,
      confirmedAt: new Date('2026-09-05T10:00:00Z'),
    };

    expect(toMyPaymentDto(doc)).toEqual({
      month: '2026-09',
      status: 'paid',
      amountMinor: undefined,
      confirmedAt: '2026-09-05T10:00:00.000Z',
      hasScreenshot: false,
    });
  });

  it('confirmedAt не задан — undefined, не «Invalid DateTime»', () => {
    expect(toMyPaymentDto(BASE)).toEqual({
      month: '2026-09',
      status: 'paid',
      amountMinor: undefined,
      confirmedAt: undefined,
      hasScreenshot: false,
    });
  });
});
