import { Types } from 'mongoose';
import { toDeliveryDto, type LeanDelivery } from './delivery.mapper';

const DELIVERY_ID = new Types.ObjectId();
const BROADCAST_ID = new Types.ObjectId();
const CHANNEL_ID = new Types.ObjectId();
const NEXT_ATTEMPT_AT = new Date(Date.UTC(2026, 8, 6, 18, 32, 0));
const SENT_AT = new Date(Date.UTC(2026, 8, 6, 18, 31, 0));

function fullDelivery(): LeanDelivery {
  return {
    _id: DELIVERY_ID,
    broadcastId: BROADCAST_ID,
    channelId: CHANNEL_ID,
    status: 'failed',
    attempts: 2,
    nextAttemptAt: NEXT_ATTEMPT_AT,
    sentAt: SENT_AT,
    error: 'Чат не найден',
    externalId: '12345',
  };
}

describe('toDeliveryDto', () => {
  it('переносит все поля, id и даты — строками; error как есть (расшифровка — забота вызывающего)', () => {
    expect(toDeliveryDto(fullDelivery())).toEqual({
      id: DELIVERY_ID.toString(),
      broadcastId: BROADCAST_ID.toString(),
      channelId: CHANNEL_ID.toString(),
      status: 'failed',
      attempts: 2,
      nextAttemptAt: '2026-09-06T18:32:00.000Z',
      sentAt: '2026-09-06T18:31:00.000Z',
      error: 'Чат не найден',
      externalId: '12345',
      text: undefined,
    });
  });

  it('text передан — попадает в DTO как есть', () => {
    const dto = toDeliveryDto(fullDelivery(), 'Итог месяца — спасибо всем!');
    expect(dto.text).toBe('Итог месяца — спасибо всем!');
  });

  it('text не передан (не ручной канал) — undefined, но ключ есть', () => {
    const dto = toDeliveryDto(fullDelivery());
    expect(dto.text).toBeUndefined();
    expect('text' in dto).toBe(true);
  });

  it('отсутствующие optional-поля (pending, без попыток) — undefined, не null', () => {
    const doc = fullDelivery();
    doc.status = 'pending';
    doc.nextAttemptAt = undefined;
    doc.sentAt = undefined;
    doc.error = undefined;
    doc.externalId = undefined;

    const dto = toDeliveryDto(doc);

    expect(dto.nextAttemptAt).toBeUndefined();
    expect(dto.sentAt).toBeUndefined();
    expect(dto.error).toBeUndefined();
    expect(dto.externalId).toBeUndefined();
  });
});
