// Статус broadcast/delivery при cancelled-исходах — отделено от
// delivery-runner.queries.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»):
// здесь — «занятие/канал пропали, рассылку отменили, что делать со
// статусом», там — захват и применение исхода отправки.
// `stopForCancelledLesson`/`stopForInactiveChannel` — готовые стоп-пути для
// delivery-runner.preflight.ts, чтобы там остался только выбор ветки, без
// деталей записи в БД.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';
import type { DeliveryRecord } from './delivery.schema';

/** Канал выключили между планированием и отправкой (`readConfig().active ===
 * false`), рассылку отменил учитель, или занятие пропало — доставка
 * cancelled, не failed: это не сбой, повторять нечего. Общая точка для всех
 * cancelled-исходов одной доставки (CLAUDE.md «Одна механика — один
 * компонент»). */
export function applyCancelledOutcome(
  deliveryModel: Model<DeliveryRecord>,
  id: Types.ObjectId,
): Promise<unknown> {
  return deliveryModel.updateOne(
    { _id: id },
    { $set: { status: 'cancelled' }, $unset: { lockedAt: 1 } },
  );
}

/** Broadcast.status по своим deliveries (docs/PLAN.md §6): хоть одна
 * `failed` → `failed`; все `sent` → `sent` (+ `sentAt`) — `manual`-доставка
 * этот список не закрывает: она ждёт кнопку «отметить отправленным»
 * (`DeliveriesService.markSent`) и становится `sent` только по нажатию;
 * до тех пор broadcast остаётся `scheduled`, даже если остальные каналы уже
 * разослали пост. `cancelled`-доставки (канал выключили после создания) не
 * мешают остальным каналам — учитываются, только если отменены все, тогда и
 * сам broadcast — `cancelled`; иначе — остаётся `scheduled`, пересчёт не
 * трогает документ зря. `status: { $ne: 'cancelled' }` в фильтре каждого
 * апдейта — рассылку, которую учитель уже отменил (`POST
 * /broadcasts/:id/cancel`), пересчёт не имеет права вернуть в `sent`/`failed`:
 * `cancelled` — финальный исход, раннер его не переигрывает. */
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
    await broadcastModel.updateOne(
      { _id: broadcastId, status: { $ne: 'cancelled' } },
      { $set: { status: 'failed' } },
    );
    return;
  }
  const relevant = deliveries.filter((d) => d.status !== 'cancelled');
  if (relevant.length === 0) {
    await broadcastModel.updateOne(
      { _id: broadcastId, status: { $ne: 'cancelled' } },
      { $set: { status: 'cancelled' } },
    );
    return;
  }
  if (relevant.every((d) => d.status === 'sent')) {
    await broadcastModel.updateOne(
      { _id: broadcastId, status: { $ne: 'cancelled' } },
      { $set: { status: 'sent', sentAt: now.toJSDate() } },
    );
  }
}

/** Отмена доставок рассылки разом, не по одной за тик раннера — общая для
 * двух источников отмены: учитель нажал «Отменить» (`POST
 * /broadcasts/:id/cancel`) и раннер обнаружил, что занятие рассылки пропало
 * или отменилось (`stopForCancelledLesson` ниже). `pending` и `manual` —
 * оба ждут своего часа (manual к тому же может ждать кнопку «отметить
 * отправленным», docs/PLAN.md §6 «Доставка») и оба ещё не потеряны для
 * отмены. `sending` не трогаем — доставку уже забрал раннер, отменять её
 * значит гнаться за отправкой, которая может уйти раньше апдейта (её поймает
 * broadcast.status === 'cancelled' в delivery-runner.preflight.ts, если
 * раннер ещё не успел вызвать адаптер); `sent`/`failed`/`cancelled` — уже
 * финальны, для них отменять нечего. */
export function cancelPendingDeliveries(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
): Promise<unknown> {
  return deliveryModel.updateMany(
    { broadcastId, status: { $in: ['pending', 'manual'] } },
    { $set: { status: 'cancelled' }, $unset: { lockedAt: 1 } },
  );
}

/** Занятие рассылки отменили или удалили между планированием и отправкой
 * (docs/PLAN.md §6) — доставка, которую раннер сейчас обрабатывает,
 * cancelled через applyCancelledOutcome; остальные pending/manual доставки
 * той же рассылки — cancelPendingDeliveries, чтобы не ждать, пока раннер
 * дойдёт до каждой по отдельности следующими тиками. Broadcast — cancelled с
 * тем же `$ne` от resurrection, что и в refreshBroadcastStatus. Лог warn, без
 * уведомления учителя: это не сбой доставки. */
export async function stopForCancelledLesson(
  deliveryModel: Model<DeliveryRecord>,
  broadcastModel: Model<BroadcastRecord>,
  logger: Logger,
  delivery: { _id: Types.ObjectId; broadcastId: Types.ObjectId },
  lessonId: Types.ObjectId,
): Promise<void> {
  await applyCancelledOutcome(deliveryModel, delivery._id);
  await cancelPendingDeliveries(deliveryModel, delivery.broadcastId);
  await broadcastModel.updateOne(
    { _id: delivery.broadcastId, status: { $ne: 'cancelled' } },
    { $set: { status: 'cancelled' } },
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
