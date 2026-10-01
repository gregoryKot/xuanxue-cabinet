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

    expect(dto.text).toBe('Напоминание об оплате — сентябрь 2026');
    expect(dto).not.toHaveProperty('paymentMonth');
    expect(dto.createdAt).toBe('2026-09-05T07:00:00.000Z');
  });

  it('payment_due без месяца — одно событие, без разделителя', () => {
    expect(toNotificationDto(raw({})).text).toBe('Напоминание об оплате');
  });

  // ADR-0162: начало занятия едет наружу ISO UTC отдельным полем, а не в
  // `text` — сервер не знает пояса устройства, время рисует читающий.
  it('lesson_cancelled — строка с названием класса и lessonStartsAt в ISO UTC', () => {
    const dto = toNotificationDto(
      raw({
        kind: 'lesson_cancelled',
        lessonId: 'l1',
        lessonStartsAt: new Date('2026-09-10T16:00:00Z'),
      }),
    );

    expect(dto.text).toBe('Занятие отменено');
    expect(dto.lessonId).toBe('l1');
    expect(dto.lessonStartsAt).toBe('2026-09-10T16:00:00.000Z');
  });

  it('у видов без занятия lessonStartsAt нет', () => {
    expect(toNotificationDto(raw({})).lessonStartsAt).toBeUndefined();
  });
});
