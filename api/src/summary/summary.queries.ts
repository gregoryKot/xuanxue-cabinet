// Запросы сводки к Mongo — countDocuments по индексам, без интерпретации
// результата (чистый форматтер — summary.format.ts). Период `from..to` общий
// для всех счётчиков (docs/PLAN.md §6 «Сводка»).
import type { Model, Types } from 'mongoose';
import type { DeliveryStatus } from '@xuanxue/shared';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';
import type { ChannelRecord } from '../channels/channel.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';

export function countBroadcastsSent(
  model: Model<BroadcastRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({ status: 'sent', sentAt: { $gte: from, $lte: to } });
}

/** Отменено самим планировщиком/рассылкой записи (insertCancelledPlaceholder,
 * broadcast.inserts.ts), не учителем через «Рассылки» — тот же признак
 * `channelIds: []`, что у BroadcastCancelNotifyService (docs/PLAN.md §6
 * «Планировщик»). `scheduledAt` у такого плейсхолдера — момент самой отмены
 * (`now` тика/вызова), не меняется задним числом — та же форма (status,
 * время), что у countBroadcastsSent. */
export function countBroadcastsCancelled(
  model: Model<BroadcastRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({
    status: 'cancelled',
    channelIds: { $size: 0 },
    scheduledAt: { $gte: from, $lte: to },
  });
}

export function countDeliveriesByStatus(
  model: Model<DeliveryRecord>,
  status: DeliveryStatus,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({ status, createdAt: { $gte: from, $lte: to } });
}

/** Доставки в ручной канал, которые ждут кнопки «отметить отправленным»
 * (docs/PLAN.md §6 «Доставка») — `pending` (учитель ещё не успел) и `manual`
 * (обычный путь после тика раннера). */
export async function countManualWaiting(
  deliveryModel: Model<DeliveryRecord>,
  channelModel: Model<ChannelRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  const manualChannels = await channelModel
    .find({ type: 'manual' }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  if (manualChannels.length === 0) return 0;
  return deliveryModel.countDocuments({
    channelId: { $in: manualChannels.map((channel) => channel._id) },
    status: { $in: ['pending', 'manual'] satisfies DeliveryStatus[] },
    createdAt: { $gte: from, $lte: to },
  });
}
