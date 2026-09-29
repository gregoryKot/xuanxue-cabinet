// Маппер ленты собирает строку для показа на чтении (ADR-0061): у payment_due
// хранится ключ месяца 'YYYY-MM', а «сентябрь 2026» рождается здесь (ADR-0150).
import { Types } from 'mongoose';
import { toNotificationDto, type RawLeanNotification } from './notification.mapper';

const CREATED_AT = new Date('2026-09-05T07:00:00Z');

function raw(overrides: Partial<RawLeanNotification>): RawLeanNotification {
  return {
    _id: new Types.ObjectId(),
    userId: 'u1',
    kind: 'payment_due',
    readAt: null,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('toNotificationDto', () => {
  it('payment_due — событие и месяц по-русски, месяц отдельным полем наружу не идёт', () => {
    const dto = toNotificationDto(raw({ paymentMonth: '2026-09' }));

    expect(dto.text).toBe('Абонемент пока не отмечен оплаченным — сентябрь 2026');
    expect(dto).not.toHaveProperty('paymentMonth');
    expect(dto.createdAt).toBe('2026-09-05T07:00:00.000Z');
  });

  it('payment_due без месяца — одно событие, без разделителя', () => {
    expect(toNotificationDto(raw({})).text).toBe('Абонемент пока не отмечен оплаченным');
  });
});
