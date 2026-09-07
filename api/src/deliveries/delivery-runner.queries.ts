// Запросы раннера доставок к Mongo — захват под гонкой и применение исхода
// отправки вынесены из сервиса (CLAUDE.md «Файлы»). Захват — атомарный
// findOneAndUpdate: второй параллельный run() не видит документ снова
// «pending», значит не отправляет его второй раз (ADR-0004). Статус
// broadcast/delivery при cancelled-исходах (занятие/канал пропали) —
// delivery-runner.status.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { DateTime } from 'luxon';
import type { Model, QueryFilter, Types } from 'mongoose';
import { DELIVERY_STALE_LOCK_MIN, type LessonStatus } from '@xuanxue/shared';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import type { DeliveryOutcome } from './delivery-runner.outcome';
import { DELIVERY_FIELD_POLICY, type DeliveryRecord } from './delivery.schema';
import type { LessonRecord } from '../lessons/lesson.schema';

const ENCRYPT_SCHEMA = encryptSchemaFrom(DELIVERY_FIELD_POLICY);

export interface ClaimableDelivery {
  _id: Types.ObjectId;
}

export interface ClaimedDelivery {
  _id: Types.ObjectId;
  broadcastId: Types.ObjectId;
  channelId: Types.ObjectId;
  attempts: number;
}

/** Кандидаты на отправку сейчас: `pending` без `nextAttemptAt` или он уже
 * настал, либо `sending`, чей захват старше DELIVERY_STALE_LOCK_MIN минут
 * (инстанс упал посреди отправки — второй тик подбирает заново). */
export function findClaimable(
  deliveryModel: Model<DeliveryRecord>,
  now: DateTime,
): Promise<ClaimableDelivery[]> {
  const staleThreshold = now.minus({ minutes: DELIVERY_STALE_LOCK_MIN }).toJSDate();
  const filter: QueryFilter<DeliveryRecord> = {
    $or: [
      {
        status: 'pending',
        $or: [
          { nextAttemptAt: { $exists: false } },
          { nextAttemptAt: { $lte: now.toJSDate() } },
        ],
      },
      { status: 'sending', lockedAt: { $lte: staleThreshold } },
    ],
  };
  return deliveryModel.find(filter, { _id: 1 }).lean<ClaimableDelivery[]>();
}

/** Атомарный захват одной доставки: `null`, если её захватил кто-то ещё
 * (гонка `Promise.all` двух `run()` или второй инстанс) — не ошибка, просто
 * пропуск. */
export function claimDelivery(
  deliveryModel: Model<DeliveryRecord>,
  id: Types.ObjectId,
  now: DateTime,
): Promise<ClaimedDelivery | null> {
  const staleThreshold = now.minus({ minutes: DELIVERY_STALE_LOCK_MIN }).toJSDate();
  return deliveryModel
    .findOneAndUpdate(
      {
        _id: id,
        $or: [
          { status: 'pending' },
          { status: 'sending', lockedAt: { $lte: staleThreshold } },
        ],
      },
      { $set: { status: 'sending', lockedAt: now.toJSDate() } },
      { returnDocument: 'after' },
    )
    .lean<ClaimedDelivery | null>();
}

// `notifyTeacher` — сигнал раннеру уведомить учителя, не поле схемы:
// записываем в базу только реальные поля delivery. `error` шифруется по
// DELIVERY_FIELD_POLICY (SECURITY §5–6) — сюда он приходит уже после scrub
// секретов канала (deliverOne), шифрование прячет
// то, что осталось, от прямого чтения коллекции. `lockedAt` снимается всегда
// вместе с исходом: захват закрыт, повторный тик видит финальный статус, а
// не «ещё держит замок».
export function applyOutcome(
  deliveryModel: Model<DeliveryRecord>,
  id: Types.ObjectId,
  outcome: DeliveryOutcome,
): Promise<unknown> {
  const fields =
    outcome.status === 'failed'
      ? encryptRecord(
          { status: 'failed', attempts: outcome.attempts, error: outcome.error },
          ENCRYPT_SCHEMA,
        )
      : outcome.status === 'pending'
        ? encryptRecord(
            {
              status: 'pending',
              attempts: outcome.attempts,
              nextAttemptAt: outcome.nextAttemptAt,
              error: outcome.error,
            },
            ENCRYPT_SCHEMA,
          )
        : outcome; // sent/manual — секретов нет, шифровать нечего
  return deliveryModel.updateOne({ _id: id }, { $set: fields, $unset: { lockedAt: 1 } });
}

/** Статус занятия для проверки «не отменили/не удалили между планированием и
 * отправкой» (docs/PLAN.md §6) — `null`, если занятие уже удалено. */
export function findLessonStatus(
  lessonModel: Model<LessonRecord>,
  lessonId: Types.ObjectId,
): Promise<LessonStatus | null> {
  return lessonModel
    .findById(lessonId, { status: 1 })
    .lean<{ status: LessonStatus } | null>()
    .then((doc) => doc?.status ?? null);
}
