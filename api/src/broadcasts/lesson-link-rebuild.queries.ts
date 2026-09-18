// Запросы LessonLinkRebuildService — CAS-запись текста/момента отправки
// рассылки и перенос ещё не захваченных доставок (образец — send-now.queries.ts,
// файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import type { BroadcastRecord } from './broadcast.schema';

export interface RebuildBroadcastLean {
  _id: Types.ObjectId;
  scheduledAt: Date;
}

/** Общий фильтр обеих проверок «раннер уже забрал доставку» — вызывается до
 * рендера и повторно перед записью (аудит 2026-09-12, M7, объяснение —
 * lesson-link-rebuild.service.ts). */
export async function hasCapturedDelivery(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
): Promise<boolean> {
  return Boolean(await deliveryModel.exists({ broadcastId, status: { $ne: 'pending' } }));
}

/** Текст пишется всегда; `scheduledAt` переносится на `target`, только если
 * прочитанное значение (`broadcast.scheduledAt`) ещё в будущем — то же
 * ограничение, что у доставок ниже: то, чей момент уже настал, не трогаем
 * (иначе можно отбросить в будущее рассылку, которую уже подтолкнул
 * SendNowService). Прочитанное значение в этом случае входит в фильтр CAS,
 * чтобы не переписать то, что SendNowService мог поменять в это же время
 * («Отправить сейчас» тоже пишет scheduledAt). Текст и время — одним
 * `updateOne` с прежним условием по статусу, иначе возможно состояние «текст
 * новый, время старое». `false` — статус или (если применимо) scheduledAt
 * сменился между чтением и этим вызовом. */
export async function writeRebuiltBroadcast(
  broadcastModel: Model<BroadcastRecord>,
  broadcast: RebuildBroadcastLean,
  encryptedText: Record<string, unknown>,
  target: DateTime,
  now: DateTime,
): Promise<boolean> {
  const filter: Record<string, unknown> = { _id: broadcast._id, status: 'scheduled' };
  const set: Record<string, unknown> = { ...encryptedText };
  if (broadcast.scheduledAt.getTime() > now.toMillis()) {
    filter.scheduledAt = broadcast.scheduledAt;
    set.scheduledAt = target.toJSDate();
  }
  const { matchedCount } = await broadcastModel.updateOne(filter, { $set: set });
  return matchedCount > 0;
}

/** «Отправить сейчас» (SendNowService) ставит `nextAttemptAt = now`
 * намеренно — пересчёт от нового `startsAt − leadMinutes` отбросил бы такую
 * доставку обратно в будущее (учитель нажал «сейчас», а ссылка не ушла).
 * Фильтр `nextAttemptAt: { $gt: now }` трогает только то, что раннер ещё не
 * готовился слать прямо сейчас; `status: 'pending'` — то, что раннер уже не
 * забрал (эта часть безопасна и без внешнего лока: документ, ставший
 * `sending`/`sent` к моменту выполнения, просто не совпадёт с фильтром). */
export function rescheduleUncapturedDeliveries(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
  now: DateTime,
  target: DateTime,
): Promise<unknown> {
  return deliveryModel.updateMany(
    { broadcastId, status: 'pending', nextAttemptAt: { $gt: now.toJSDate() } },
    { $set: { nextAttemptAt: target.toJSDate() } },
  );
}
