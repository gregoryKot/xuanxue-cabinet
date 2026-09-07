// Единственный маппер DeliveryRecord (lean, уже расшифрованный) →
// DeliveryDto (CLAUDE.md, раздел «API»: документ Mongoose наружу не
// возвращается — lockedAt в DTO нет, это внутренний замок раннера).
import type { Types } from 'mongoose';
import type { DeliveryDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { DeliveryRecord } from './delivery.schema';

// Omit — гомоморфный mapped type, делает пересечение совместимым с
// `Record<string, unknown>` для decryptRecord (тот же приём, что у
// LeanClass/LeanLesson/LeanBroadcast — комментарий там же).
export type LeanDelivery = Omit<DeliveryRecord, 'broadcastId'> & {
  _id: Types.ObjectId;
  broadcastId: Types.ObjectId;
};

/** `text` — только у ручного канала (DeliveriesService.getById решает,
 * передавать ли его сюда: текст рассылки, а не поле самой доставки). */
export function toDeliveryDto(doc: LeanDelivery, text?: string): DeliveryDto {
  return {
    id: doc._id.toString(),
    broadcastId: doc.broadcastId.toString(),
    channelId: doc.channelId.toString(),
    status: doc.status,
    attempts: doc.attempts,
    nextAttemptAt: doc.nextAttemptAt ? toIsoUtc(doc.nextAttemptAt) : undefined,
    sentAt: doc.sentAt ? toIsoUtc(doc.sentAt) : undefined,
    error: doc.error,
    externalId: doc.externalId,
    text,
  };
}
