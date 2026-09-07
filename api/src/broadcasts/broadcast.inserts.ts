// Запись рассылки в Mongo — общая для трёх видов (docs/PLAN.md §6):
// планировщик ссылок, рассылка записи, разовая рассылка учителя. Раньше это
// были два похожих файла (broadcast-planner.inserts.ts,
// recording-broadcast.inserts.ts) — один и тот же приём insert+insertMany с
// терпимостью к E11000, только естественный ключ разный (CLAUDE.md «Одна
// механика — один компонент»).
import type { Model, Types } from 'mongoose';
import type { DateTime } from 'luxon';
import type { BroadcastKind } from '@xuanxue/shared';
import {
  isDuplicateKeyBulkError,
  isDuplicateKeyError,
} from '../common/mongo-error-codes';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { BROADCAST_FIELD_POLICY, type BroadcastRecord } from './broadcast.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

export interface BroadcastInsertPayload {
  kind: BroadcastKind;
  lessonId?: Types.ObjectId;
  /** Только kind 'recording' — url/file_id записи, естественный ключ
   * идемпотентности (уникальный индекс (lessonId, recordingKey)). */
  recordingKey?: string;
  telegramFileId?: string;
  createdBy?: Types.ObjectId;
  channelIds: Types.ObjectId[];
  scheduledAt: Date;
  text: string;
  /** Раннер не берёт доставку раньше этого момента — нужно только разовой
   * рассылке (scheduledAt учителя может быть в будущем); у ссылки на занятие
   * и у записи это тот же момент, что и сама рассылка — раннер должен забрать
   * сразу, поле не заполняется. */
  deliveryNextAttemptAt?: Date;
}

/** Естественный ключ для поиска уже созданной рассылки при E11000: у
 * lesson_link — (lessonId, kind) через частичный индекс, у recording —
 * (lessonId, recordingKey) через свой; у manual ключа нет вовсе — разовая
 * рассылка не дедуплицируется (повтор POST создаёт вторую, PLAN §6), поэтому
 * `undefined` — сигнал не искать существующий документ, а пробросить E11000
 * как настоящую (неожиданную) ошибку. */
function naturalKeyFilter(
  payload: Pick<BroadcastInsertPayload, 'kind' | 'lessonId' | 'recordingKey'>,
): Record<string, unknown> | undefined {
  if (payload.kind === 'lesson_link' && payload.lessonId) {
    return { lessonId: payload.lessonId, kind: 'lesson_link' };
  }
  if (
    payload.kind === 'recording' &&
    payload.lessonId &&
    payload.recordingKey !== undefined
  ) {
    return { lessonId: payload.lessonId, recordingKey: payload.recordingKey };
  }
  return undefined;
}

export interface InsertBroadcastResult {
  broadcastId: Types.ObjectId;
  /** `true` — реально создали новый broadcast, `false` — уже было (доставки
   * при этом могли и досоздаться). */
  isNew: boolean;
}

/** insert broadcast + deliveries вместе (ADR-0004/§4 PLAN): второй вызов с
 * тем же естественным ключом падает на уникальном индексе — E11000 значит
 * «уже создано», не ошибка. Тогда всё равно пробуем insertMany доставок по
 * найденному broadcast: первый вызов мог упасть между insert broadcast и
 * insert deliveries (инстанс упал, Mongo моргнула) — второй достраивает
 * недостающее, а не останавливается на «уже есть broadcast». Дубли
 * `channelIds` во входе (учитель дважды выбрал канал) закрывает та же
 * терпимость к E11000 у insertMany — 500 не будет, даже если DTO почему-то
 * пропустит дубль. */
export async function insertBroadcastWithDeliveries(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  payload: BroadcastInsertPayload,
): Promise<InsertBroadcastResult> {
  let broadcastId: Types.ObjectId;
  let isNew = true;
  try {
    const created = await broadcastModel.create(
      encryptRecord(
        {
          kind: payload.kind,
          lessonId: payload.lessonId,
          recordingKey: payload.recordingKey,
          telegramFileId: payload.telegramFileId,
          createdBy: payload.createdBy,
          channelIds: payload.channelIds,
          scheduledAt: payload.scheduledAt,
          text: payload.text,
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    broadcastId = created._id;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const filter = naturalKeyFilter(payload);
    const existing = filter
      ? await broadcastModel.findOne(filter).lean<{ _id: Types.ObjectId } | null>()
      : null;
    // Индекс сообщил о дубле, а документа не находим (или ключа для поиска
    // нет вовсе, как у manual) — расхождение хуже молчания: пробрасываем
    // исходную ошибку, не глотаем её как обычный E11000.
    if (!existing) throw err;
    isNew = false;
    broadcastId = existing._id;
  }
  const deliveries = payload.channelIds.map((channelId) => ({
    broadcastId,
    channelId,
    ...(payload.deliveryNextAttemptAt
      ? { nextAttemptAt: payload.deliveryNextAttemptAt }
      : {}),
  }));
  try {
    await deliveryModel.insertMany(deliveries, { ordered: false });
  } catch (err) {
    if (!isDuplicateKeyBulkError(err)) throw err;
  }
  return { broadcastId, isNew };
}

export interface CancelledPlaceholderPayload {
  kind: BroadcastKind;
  lessonId?: Types.ObjectId;
  recordingKey?: string;
  reason: string;
}

/** Слать нечего/некому — причина в `text` открытым текстом (короткая, не
 * секрет), broadcast всё равно шифруется целиком по общей политике поля
 * (BROADCAST_FIELD_POLICY.text = enc — решение одно на все kind). Тот же
 * естественный ключ, что у настоящей рассылки, закрывает повтор
 * предупреждения на каждом вызове — `true`, только если документ реально
 * создан именно этим вызовом. */
export async function insertCancelledPlaceholder(
  broadcastModel: Model<BroadcastRecord>,
  payload: CancelledPlaceholderPayload,
  now: DateTime,
): Promise<boolean> {
  try {
    await broadcastModel.create(
      encryptRecord(
        {
          kind: payload.kind,
          lessonId: payload.lessonId,
          recordingKey: payload.recordingKey,
          channelIds: [],
          scheduledAt: now.toJSDate(),
          text: payload.reason,
          status: 'cancelled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    return true;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    return false;
  }
}
