// Запись планировщика рассылок в Mongo: настоящая рассылка + доставки, или
// cancelled-плейсхолдер с причиной. Запросы на чтение —
// broadcast-planner.queries.ts (разделено ради лимита файла, CLAUDE.md
// «Храповики»).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import {
  isDuplicateKeyBulkError,
  isDuplicateKeyError,
} from '../common/mongo-error-codes';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { BROADCAST_FIELD_POLICY, type BroadcastRecord } from './broadcast.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

/** insert broadcast + deliveries вместе (ADR-0004/§4 PLAN): второй тик падает
 * на частичном индексе (lessonId, kind) — E11000 значит «уже создано», не
 * ошибка. Тогда всё равно пробуем insertMany доставок по найденному
 * broadcast: первый тик мог упасть между insert broadcast и insert deliveries
 * (инстанс упал, Mongo моргнула) — второй тик достраивает недостающее, а не
 * останавливается на «уже есть broadcast». `true` — реально создали новый
 * broadcast, `false` — уже было (доставки при этом могли и досоздаться). */
export async function insertBroadcastWithDeliveries(
  broadcastModel: Model<BroadcastRecord>,
  deliveryModel: Model<DeliveryRecord>,
  payload: {
    lessonId: Types.ObjectId;
    channelIds: Types.ObjectId[];
    scheduledAt: Date;
    text: string;
  },
): Promise<boolean> {
  let broadcastId: Types.ObjectId;
  let isNew = true;
  try {
    const created = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: payload.lessonId,
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
    isNew = false;
    const existing = await broadcastModel
      .findOne({ lessonId: payload.lessonId, kind: 'lesson_link' })
      .lean<{ _id: Types.ObjectId } | null>();
    // Индекс сообщил о дубле, а документа не находим — расхождение хуже
    // молчания: пробрасываем исходную ошибку, не глотаем её как обычный E11000.
    if (!existing) throw err;
    broadcastId = existing._id;
  }
  const deliveries = payload.channelIds.map((channelId) => ({
    broadcastId,
    channelId,
  }));
  try {
    await deliveryModel.insertMany(deliveries, { ordered: false });
  } catch (err) {
    if (!isDuplicateKeyBulkError(err)) throw err;
  }
  return isNew;
}

/** Ссылку не слать — причина в `text` открытым текстом (короткая, не
 * секрет), broadcast всё равно шифруется целиком по общей политике поля
 * (BROADCAST_FIELD_POLICY.text = enc — решение одно на все kind, не по
 * содержимому). Частичный индекс (lessonId, kind) закрывает повтор
 * предупреждения на каждом тике так же, как настоящую рассылку — `true`,
 * только если документ реально создан именно этим вызовом: вызывающий код
 * логирует warn/error один раз, не на каждом повторном тике. */
export async function insertCancelledPlaceholder(
  broadcastModel: Model<BroadcastRecord>,
  lessonId: Types.ObjectId,
  reason: string,
  now: DateTime,
): Promise<boolean> {
  try {
    await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId,
          channelIds: [],
          scheduledAt: now.toJSDate(),
          text: reason,
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
