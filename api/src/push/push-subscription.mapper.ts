// Маппер PushSubscriptionRecord (lean) → PushSubscriptionDto. `p256dh` и
// `auth` сюда никогда не попадают — ни расшифрованные, ни как есть
// (CLAUDE.md «API»: секрет доставки не покидает сервер, как config канала).
import type { Types } from 'mongoose';
import type { PushSubscriptionDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  PUSH_SUBSCRIPTION_ENCRYPT_SCHEMA,
  type PushSubscriptionRecord,
} from './push-subscription.schema';

/** `PushSubscriptionRecord` как его отдаёт `.lean()` — тот же приём
 * `Pick<T, keyof T>`, что у RawLeanExamImage (exam-image.mapper.ts). Секреты
 * здесь ЕСТЬ (в отличие от LeanChannel/channel.mapper.ts): их читает
 * decryptPushSubscription ниже — для read-after-write теста сервиса
 * (CLAUDE.md «Тесты») и для PR №4, который шлёт сам push. HTTP-ответ этим
 * типом не пользуется — только toPushSubscriptionDto, который их не берёт. */
export type RawLeanPushSubscription = Pick<
  PushSubscriptionRecord,
  keyof PushSubscriptionRecord
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** `p256dh`/`auth` расшифрованы — только для внутреннего чтения (см. комментарий
 * у RawLeanPushSubscription выше), никогда не для HTTP-ответа. */
export function decryptPushSubscription(
  doc: RawLeanPushSubscription,
): RawLeanPushSubscription {
  return decryptRecord(doc, PUSH_SUBSCRIPTION_ENCRYPT_SCHEMA);
}

export function toPushSubscriptionDto(doc: RawLeanPushSubscription): PushSubscriptionDto {
  return {
    id: doc._id.toString(),
    endpoint: doc.endpoint,
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
