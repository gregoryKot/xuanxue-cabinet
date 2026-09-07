// Запросы журнала рассылок, которые трогают больше одной модели — вынесено
// из broadcasts.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
// Доставки одной рассылки (`GET /broadcasts/:id/deliveries`, docs/PLAN.md §6
// «Рассылки») — то же правило текста, что и у одиночного `GET
// /deliveries/:id` (DeliveriesService.getById): текст виден только у
// доставки в ручной канал. Здесь текст уже расшифрован вызывающим кодом
// (BroadcastsService.getById) — одна расшифровка на всю рассылку, не на
// каждую доставку; типы каналов тоже одним запросом, не N+1 на доставку.
// Отмена (`POST /broadcasts/:id/cancel`) — атомарный CAS по статусу, не
// read-then-write: раннер меняет статус рассылки в те же миллисекунды
// (refreshBroadcastStatus), и наивный «прочитали scheduled → записали
// cancelled» может затереть исход, который раннер успел записать между
// чтением и записью здесь.
import { Types, type Model } from 'mongoose';
import { LIST_LIMIT_MAX, type ChannelType, type DeliveryDto } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptSchemaFrom } from '../common/field-policy';
import { decryptRecord } from '../utils/encryption';
import type { ChannelRecord } from '../channels/channel.schema';
import { cancelPendingDeliveries } from '../deliveries/delivery-runner.status';
import {
  DELIVERY_FIELD_POLICY,
  type DeliveryRecord,
} from '../deliveries/delivery.schema';
import { toDeliveryDto, type LeanDelivery } from '../deliveries/delivery.mapper';
import type { BroadcastRecord } from './broadcast.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(DELIVERY_FIELD_POLICY);
const BROADCAST_NOT_FOUND = 'Рассылка не найдена. Обновите страницу.';

// VOICE.md: конкретика вместо общей формулировки — учитель видит, что именно
// случилось с рассылкой, а не гадает по одному тексту на три статуса.
function cancelConflictMessage(status: BroadcastRecord['status']): string {
  if (status === 'sent') return 'Уже отправлено. Отменить нечего.';
  if (status === 'failed')
    return 'Рассылка не удалась — отменять нечего. Создайте новую.';
  return 'Рассылка уже отменена.'; // единственный оставшийся статус — 'cancelled'
}

/**
 * Отмена рассылки учителем: атомарный переход `scheduled` → `cancelled`
 * (`updateOne` с условием на `status` в фильтре, не read-then-write) —
 * второй одновременный вызов (двойной клик, или раннер только что перевёл
 * рассылку в `sent`/`failed` через `refreshBroadcastStatus`) не может
 * затереть уже случившийся исход: `matchedCount === 0` значит статус успел
 * измениться между чтением экрана и нажатием кнопки, читаем его заново для
 * точного текста ошибки. `pending`- и `manual`-доставки закрывает
 * `cancelPendingDeliveries` уже ПОСЛЕ того, как переход рассылки
 * зафиксирован — раннер, который к этому моменту читает `broadcast.status`
 * (delivery-runner.preflight.ts), уже увидит `cancelled` и остановится сам.
 */
export async function cancelBroadcast(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  id: string,
): Promise<void> {
  const { matchedCount } = await broadcastModel.updateOne(
    { _id: id, status: 'scheduled' },
    { $set: { status: 'cancelled' } },
  );
  if (matchedCount === 0) {
    const current = await broadcastModel
      .findById(id, { status: 1 })
      .lean<Pick<BroadcastRecord, 'status'> | null>();
    if (!current) throw new NotFoundError(BROADCAST_NOT_FOUND);
    throw new ConflictError(cancelConflictMessage(current.status));
  }
  await cancelPendingDeliveries(deliveryModel, new Types.ObjectId(id));
}

/** Доставки одной рассылки — `.limit(LIST_LIMIT_MAX)` тем же приёмом, что и
 * у остальных списков (CLAUDE.md «API»: «дай всё» запрещено); у рассылки не
 * бывает больше `BROADCAST_LIMITS.channelsMax` каналов, лимит — не сценарий,
 * а инвариант «список всегда с лимитом». */
export async function listDeliveriesForBroadcast(
  deliveryModel: Model<DeliveryRecord>,
  channelModel: Model<ChannelRecord>,
  broadcastId: Types.ObjectId,
  broadcastText: string,
): Promise<DeliveryDto[]> {
  const deliveries = await deliveryModel
    .find({ broadcastId })
    .sort({ createdAt: 1 })
    .limit(LIST_LIMIT_MAX)
    .lean<LeanDelivery[]>();
  if (deliveries.length === 0) return [];

  const channelIds = deliveries.map((delivery) => delivery.channelId);
  const channels = await channelModel
    .find({ _id: { $in: channelIds } }, { type: 1 })
    .lean<{ _id: Types.ObjectId; type: ChannelType }[]>();
  const typeById = new Map(
    channels.map((channel) => [channel._id.toString(), channel.type]),
  );

  return deliveries.map((doc) => {
    const isManual = typeById.get(doc.channelId.toString()) === 'manual';
    return toDeliveryDto(
      decryptRecord(doc, ENCRYPT_SCHEMA),
      isManual ? broadcastText : undefined,
    );
  });
}
