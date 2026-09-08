// Запросы «Отправить ссылку сейчас» (docs/PLAN.md §6 «Планирование», аудит
// В12) — вынесено из send-now.service.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»). `applySendNowUpdate` — вся логика существующей рассылки:
//   - нет документа — insertBroadcastWithDeliveries (createSendNowBroadcast,
//     отдельная функция ниже — вызывается сервисом напрямую, до неё нет CAS);
//   - `sent` — 409, рассылка уже ушла, трогать нечего;
//   - все переданные каналы уже `sent` (allChannelsAlreadySent) — 409:
//     реконструировать нечего, слать больше некому (ревью п.3б);
//   - доставка уже захвачена раннером или отправлена
//     (hasCapturedSendNowDelivery) — текст/каналы поздно менять (тот же
//     приём, что у topic-rebuild.service.ts, ~61–65), ускоряем только
//     оставшиеся `pending`;
//   - иначе — `scheduled`/`cancelled`/`failed` пишутся новым текстом и
//     каналами одним и тем же условным апдейтом
//     (writeSendNowBroadcastContent, CAS от фактического текущего статуса —
//     единая ветка вместо разных функций на `scheduled` и `cancelled`/
//     `failed`, чтобы гвард «захвачено» не пришлось дублировать на обе,
//     ревью п.6), доставки — reviveSendNowDeliveries.
// `false` от writeSendNowBroadcastContent — статус сменился между чтением и
// этим вызовом (раннер только что дописал sent/failed, или второй клик
// «Отправить сейчас» победил гонку первым) — applySendNowUpdate перечитывает
// статус и решает заново, до MAX_STATUS_RACE_RETRIES раз (тот же приём CAS в
// фильтре, что у cancelBroadcast, broadcast-journal.queries.ts).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastStatus } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import { insertBroadcastWithDeliveries } from './broadcast.inserts';
import { BROADCAST_FIELD_POLICY, type BroadcastRecord } from './broadcast.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

// VOICE.md: что случилось и что сделать. «Рассылка исчезла» — только когда
// документ реально не находится повторным чтением (редко: занятие/рассылку
// удалили руками между шагами); гонка статуса — отдельный текст (ревью п.5),
// рассылка в этом случае никуда не девалась, просто статус ещё раз сменился
// быстрее наших повторов.
const BROADCAST_VANISHED = 'Рассылка исчезла между шагами — попробуйте ещё раз.';
const STATUS_RACE_EXHAUSTED =
  'Статус рассылки меняется прямо сейчас — обновите страницу и попробуйте ещё раз.';
const ALREADY_SENT_MESSAGE = 'Ссылка уже ушла/уходит — смотрите журнал рассылок.';
const ALL_CHANNELS_SENT_MESSAGE =
  'Ссылка уже ушла во все подключённые каналы — смотрите журнал рассылок.';
// Гонка (статус сменился между чтением и CAS) сходится за пару повторов на
// практике — предел не даёт зациклиться, а не гонится за теорией.
const MAX_STATUS_RACE_RETRIES = 3;

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

/** Хоть одна доставка этой рассылки раннер уже забрал (`sending`) или
 * отправил (`sent`) — переписывать text/channelIds поздно: получатель либо
 * вот-вот увидит то, что раннер прочитал раньше нас, либо уже увидел (тот же
 * приём, что у topic-rebuild.service.ts, ~61–65, но уже: `cancelled`/
 * `failed` доставки безопасно оживляет reviveSendNowDeliveries, раннер их не
 * трогает — опасны только `sending`/`sent`). */
export async function hasCapturedSendNowDelivery(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
): Promise<boolean> {
  const found = await deliveryModel.exists({
    broadcastId,
    status: { $in: ['sending', 'sent'] },
  });
  return found !== null;
}

/** `true` — у каждого переданного канала доставка уже `sent`: слать больше
 * некому, реконструкция ничего не создаст `pending` (ревью п.3б). Канал без
 * доставки вовсе (новый в списке) считается «не отправлен» — не мешает
 * реконструкции. */
export async function allChannelsAlreadySent(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
  channelIds: Types.ObjectId[],
): Promise<boolean> {
  const sentCount = await deliveryModel.countDocuments({
    broadcastId,
    channelId: { $in: channelIds },
    status: 'sent',
  });
  return sentCount === channelIds.length;
}

/** Захваченная доставка есть — единственное, что можно честно сделать: не
 * ждать `nextAttemptAt` для того, что раннер ещё не тронул. Без CAS по
 * broadcast — документ здесь не пишется, гонки писать не с чем. */
export function accelerateSendNowDeliveries(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
  now: DateTime,
): Promise<unknown> {
  return deliveryModel.updateMany(
    { broadcastId, status: 'pending' },
    { $set: { nextAttemptAt: now.toJSDate() } },
  );
}

/** Условный переход в `scheduled` с новым текстом/каналами — от ЛЮБОГО
 * фактического текущего статуса (`fromStatus`), одна и та же запись что для
 * `scheduled` (учитель поправил ссылку/канал, а раннер ещё не начал), что для
 * `cancelled`/`failed` (оживление). `false` — статус сменился между чтением и
 * этим вызовом, applySendNowUpdate перечитывает и решает заново. */
async function writeSendNowBroadcastContent(
  broadcastModel: Model<BroadcastRecord>,
  id: Types.ObjectId,
  fromStatus: BroadcastStatus,
  channelIds: Types.ObjectId[],
  text: string,
  now: DateTime,
): Promise<boolean> {
  const fields = encryptRecord(
    { status: 'scheduled', channelIds, scheduledAt: now.toJSDate(), text },
    ENCRYPT_SCHEMA,
  );
  const { matchedCount } = await broadcastModel.updateOne(
    { _id: id, status: fromStatus },
    { $set: fields },
  );
  return matchedCount > 0;
}

/** Доставки рассылки после writeSendNowBroadcastContent, канал за каналом
 * (список короткий — ограничен BROADCAST_LIMITS.channelsMax, не сценарий
 * «дай всё»). Сперва — канал, выпавший из списка (учитель выключил его или
 * убрал у класса): его ещё не отправленная доставка больше не нужна —
 * `cancelled`, иначе refreshBroadcastStatus держал бы рассылку в `failed`
 * вечно из-за канала, которого больше нет в плане (ревью п.3а); `sent` не
 * трогаем — второй раз в тот же канал не шлём, даже если его убрали из
 * списка потом. Затем — своя, отменённая ранее или провалившаяся доставка
 * оставшегося или уже `pending` канала переставляется на сейчас (не ждать
 * `nextAttemptAt` в будущем — тот же смысл, что раньше был у отдельной
 * rescheduleSendNowBroadcast); канала не было в прошлый раз (плейсхолдер
 * `insertCancelledPlaceholder` всегда создаётся с `channelIds: []`,
 * docs/RUNBOOK.md §8.1 п.3, или класс получил канал уже после отмены) —
 * вставляется новая. Уже `sent` доставку канала не трогаем — второй раз в
 * тот же канал не шлём. */
export async function reviveSendNowDeliveries(
  deliveryModel: Model<DeliveryRecord>,
  broadcastId: Types.ObjectId,
  channelIds: Types.ObjectId[],
  now: DateTime,
): Promise<void> {
  await deliveryModel.updateMany(
    {
      broadcastId,
      channelId: { $nin: channelIds },
      status: { $in: ['failed', 'pending'] },
    },
    { $set: { status: 'cancelled' }, $unset: { lockedAt: 1 } },
  );

  for (const channelId of channelIds) {
    const { matchedCount } = await deliveryModel.updateOne(
      { broadcastId, channelId, status: { $in: ['cancelled', 'failed', 'pending'] } },
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
      // (sent — единственный оставшийся вариант, cancelled/failed/pending
      // уже перехвачены апдейтом выше), трогать её не нужно.
      if (!isDuplicateKeyError(err)) throw err;
    }
  }
}

/** Рассылка на это занятие уже существует — три исхода по фактическому
 * статусу и состоянию доставок, гонка со статусом (второй клик, раннер)
 * решается перечитыванием до MAX_STATUS_RACE_RETRIES раз. */
export async function applySendNowUpdate(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  existing: ExistingSendNowBroadcast,
  channelIds: Types.ObjectId[],
  text: string,
  now: DateTime,
): Promise<Types.ObjectId> {
  let current = existing;
  for (let attempt = 0; attempt < MAX_STATUS_RACE_RETRIES; attempt += 1) {
    if (current.status === 'sent') throw new ConflictError(ALREADY_SENT_MESSAGE);

    if (await allChannelsAlreadySent(deliveryModel, current._id, channelIds)) {
      throw new ConflictError(ALL_CHANNELS_SENT_MESSAGE);
    }

    if (await hasCapturedSendNowDelivery(deliveryModel, current._id)) {
      await accelerateSendNowDeliveries(deliveryModel, current._id, now);
      return current._id;
    }

    const ok = await writeSendNowBroadcastContent(
      broadcastModel,
      current._id,
      current.status,
      channelIds,
      text,
      now,
    );
    if (ok) {
      await reviveSendNowDeliveries(deliveryModel, current._id, channelIds, now);
      return current._id;
    }

    const fresh = await broadcastModel
      .findById(current._id, { status: 1 })
      .lean<{ status: BroadcastStatus } | null>();
    if (!fresh) throw new NotFoundError(BROADCAST_VANISHED);
    current = { _id: current._id, status: fresh.status };
  }
  throw new ConflictError(STATUS_RACE_EXHAUSTED);
}
