// Статус broadcast/delivery при cancelled-исходах — отделено от
// delivery-runner.queries.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»):
// здесь — «занятие/канал пропали, что делать со статусом», там — захват и
// применение исхода отправки. `stopForCancelledLesson`/`stopForInactiveChannel`
// — готовые стоп-пути для delivery-runner.preflight.ts, чтобы там остался
// только выбор ветки, без деталей записи в БД.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';
import type { DeliveryRecord } from './delivery.schema';

/** Канал выключили между планированием и отправкой (`readConfig().active ===
 * false`) — доставка cancelled, не failed: это не сбой, повторять нечего. */
function applyCancelledOutcome(
  deliveryModel: Model<DeliveryRecord>,
  id: Types.ObjectId,
): Promise<unknown> {
  return deliveryModel.updateOne(
    { _id: id },
    { $set: { status: 'cancelled' }, $unset: { lockedAt: 1 } },
  );
}

/** Занятие исчезло или отменилось после того, как рассылка была
 * запланирована: доставка и вся рассылка — cancelled, без уведомления
 * учителя (это не сбой доставки, docs/PLAN.md §6). */
function cancelDeliveryForLesson(
  deliveryModel: Model<DeliveryRecord>,
  broadcastModel: Model<BroadcastRecord>,
  deliveryId: Types.ObjectId,
  broadcastId: Types.ObjectId,
): Promise<[unknown, unknown]> {
  return Promise.all([
    applyCancelledOutcome(deliveryModel, deliveryId),
    broadcastModel.updateOne({ _id: broadcastId }, { $set: { status: 'cancelled' } }),
  ]);
}

/** Broadcast.status по своим deliveries (docs/PLAN.md §6): хоть одна
 * `failed` → `failed`; все `sent` → `sent` (+ `sentAt`) — `manual`-доставка
 * этот список не закрывает: она ждёт кнопку «отметить отправленным»
 * (`DeliveriesService.markSent`) и становится `sent` только по нажатию;
 * до тех пор broadcast остаётся `scheduled`, даже если остальные каналы уже
 * разослали пост. `cancelled`-доставки (канал выключили после создания) не
 * мешают остальным каналам — учитываются, только если отменены все, тогда и
 * сам broadcast — `cancelled`; иначе — остаётся `scheduled`, пересчёт не
 * трогает документ зря. */
export async function refreshBroadcastStatus(
  deliveryModel: Model<DeliveryRecord>,
  broadcastModel: Model<BroadcastRecord>,
  broadcastId: Types.ObjectId,
  now: DateTime,
): Promise<void> {
  const deliveries = await deliveryModel
    .find({ broadcastId }, { status: 1 })
    .lean<{ status: DeliveryRecord['status'] }[]>();
  if (deliveries.length === 0) return;

  if (deliveries.some((d) => d.status === 'failed')) {
    await broadcastModel.updateOne({ _id: broadcastId }, { $set: { status: 'failed' } });
    return;
  }
  const relevant = deliveries.filter((d) => d.status !== 'cancelled');
  if (relevant.length === 0) {
    await broadcastModel.updateOne(
      { _id: broadcastId },
      { $set: { status: 'cancelled' } },
    );
    return;
  }
  if (relevant.every((d) => d.status === 'sent')) {
    await broadcastModel.updateOne(
      { _id: broadcastId },
      { $set: { status: 'sent', sentAt: now.toJSDate() } },
    );
  }
}

/** Занятие рассылки отменили или удалили между планированием и отправкой
 * (docs/PLAN.md §6) — доставка и broadcast cancelled, лог warn, без
 * уведомления учителя: это не сбой доставки. */
export async function stopForCancelledLesson(
  deliveryModel: Model<DeliveryRecord>,
  broadcastModel: Model<BroadcastRecord>,
  logger: Logger,
  delivery: { _id: Types.ObjectId; broadcastId: Types.ObjectId },
  lessonId: Types.ObjectId,
): Promise<void> {
  await cancelDeliveryForLesson(
    deliveryModel,
    broadcastModel,
    delivery._id,
    delivery.broadcastId,
  );
  logger.warn(
    `доставка ${delivery._id.toString()}: занятие ${lessonId.toString()} ` +
      'отменено или удалено — рассылка cancelled',
  );
}

/** Канал выключили между планированием и отправкой (`readConfig().active
 * === false`) — доставка cancelled, broadcast пересчитывается тем же тиком. */
export async function stopForInactiveChannel(
  deliveryModel: Model<DeliveryRecord>,
  broadcastModel: Model<BroadcastRecord>,
  deliveryId: Types.ObjectId,
  broadcastId: Types.ObjectId,
  now: DateTime,
): Promise<void> {
  await applyCancelledOutcome(deliveryModel, deliveryId);
  await refreshBroadcastStatus(deliveryModel, broadcastModel, broadcastId, now);
}
