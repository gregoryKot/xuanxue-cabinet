// Запросы «Отправить ссылку сейчас» (docs/PLAN.md §6 «Планирование», аудит
// В12) — вынесено из send-now.service.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»). Три ветки по текущему статусу единственной lesson_link
// рассылки занятия:
//   - нет документа — insertBroadcastWithDeliveries (createSendNowBroadcast);
//   - `scheduled` — раннер ещё не закончил, просто торопим момент отправки
//     (rescheduleSendNowBroadcast);
//   - `cancelled`/`failed` — уникальный частичный индекс (lessonId, kind:
//     'lesson_link', broadcast.schema.ts) держит слот даже за отменённым/
//     провалившимся документом, второй insert туда невозможен: единственный
//     путь, совместимый с индексом, — «оживить» существующий документ
//     условным апдейтом (reviveSendNowBroadcast), доставки — отдельным шагом
//     (reviveSendNowDeliveries), одной атомарной операцией на обе коллекции
//     не обойтись.
// Все три CAS по статусу в фильтре — тот же приём, что у cancelBroadcast
// (broadcast-journal.queries.ts): раннер может менять статус той же
// рассылки в те же миллисекунды, read-then-write затёр бы его исход.
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastStatus } from '@xuanxue/shared';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import { insertBroadcastWithDeliveries } from './broadcast.inserts';
import { BROADCAST_FIELD_POLICY, type BroadcastRecord } from './broadcast.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

export interface ExistingSendNowBroadcast {
  _id: Types.ObjectId;
  status: BroadcastStatus;
}

/** Рассылки ещё не было — обычный путь первого клика «Отправить сейчас». */
export function createSendNowBroadcast(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  lessonId: Types.ObjectId,
  channelIds: Types.ObjectId[],
  text: string,
  now: DateTime,
): Promise<Types.ObjectId> {
  return insertBroadcastWithDeliveries(broadcastModel, deliveryModel, {
    kind: 'lesson_link',
    lessonId,
    channelIds,
    scheduledAt: now.toJSDate(),
    deliveryNextAttemptAt: now.toJSDate(),
    text,
  }).then(({ broadcastId }) => broadcastId);
}

/** `scheduled` — не всё ещё доставлено, но документ уже в очереди: учитель
 * не поменял ни текст, ни каналы, только просит не ждать окно лида. Только
 * `pending`-доставки получают новый `nextAttemptAt` — `sending` (раннер уже
 * взял), `sent`/`manual`/`failed` не трогаем (тот же отбор, что у
 * cancelPendingDeliveries, delivery-runner.status.ts). `false` — статус
 * сменился между чтением и этим вызовом (раннер как раз дописал sent/failed,
 * или второй клик «Отправить сейчас» победил гонку первым), вызывающий код
 * (SendNowService) перечитывает и решает заново. */
export async function rescheduleSendNowBroadcast(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  id: Types.ObjectId,
  now: DateTime,
): Promise<boolean> {
  const { matchedCount } = await broadcastModel.updateOne(
    { _id: id, status: 'scheduled' },
    { $set: { scheduledAt: now.toJSDate() } },
  );
  if (matchedCount === 0) return false;
  await deliveryModel.updateMany(
    { broadcastId: id, status: 'pending' },
    { $set: { nextAttemptAt: now.toJSDate() } },
  );
  return true;
}

/** `cancelled`/`failed` → `scheduled`: текст и список каналов выставляются
 * заново (со времени последней попытки могли поменяться), `false` — то же
 * значение гонки, что у rescheduleSendNowBroadcast. */
export async function reviveSendNowBroadcast(
  broadcastModel: Model<BroadcastRecord>,
  id: Types.ObjectId,
  channelIds: Types.ObjectId[],
  text: string,
  now: DateTime,
): Promise<boolean> {
  const fields = encryptRecord(
    { status: 'scheduled', channelIds, scheduledAt: now.toJSDate(), text },
    ENCRYPT_SCHEMA,
  );
  const { matchedCount } = await broadcastModel.updateOne(
    { _id: id, status: { $in: ['cancelled', 'failed'] } },
    { $set: fields },
  );
  return matchedCount > 0;
}

/** Доставки ожившей рассылки, канал за каналом (список короткий — ограничен
 * BROADCAST_LIMITS.channelsMax, не сценарий «дай всё»): своя, отменённая
 * ранее или провалившаяся доставка канала — сбрасывается в `pending`;
 * канала не было в прошлый раз (плейсхолдер `insertCancelledPlaceholder`
 * всегда создаётся с `channelIds: []`, docs/RUNBOOK.md §8.1 п.3, или класс
 * получил канал уже после отмены) — вставляется новая. Уже `sent` доставку
 * канала не трогаем — второй раз в тот же канал не шлём. */
export async function reviveSendNowDeliveries(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
  channelIds: Types.ObjectId[],
  now: DateTime,
): Promise<void> {
  for (const channelId of channelIds) {
    const { matchedCount } = await deliveryModel.updateOne(
      { broadcastId, channelId, status: { $in: ['cancelled', 'failed'] } },
      {
        $set: { status: 'pending', attempts: 0, nextAttemptAt: now.toJSDate() },
        $unset: { lockedAt: 1, error: 1 },
      },
    );
    if (matchedCount > 0) continue;
    try {
      await deliveryModel.create({
        broadcastId,
        channelId,
        nextAttemptAt: now.toJSDate(),
      });
    } catch (err) {
      // Уникальный индекс (broadcastId, channelId, delivery.schema.ts) не
      // даёт вставить вторую — у канала уже есть доставка в другом статусе
      // (sent или уже pending), трогать её не нужно.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}
