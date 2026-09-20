// Запись подтверждения/снятия оплаты — вынесено из payments.service.ts
// (файл-лимит CLAUDE.md «Храповики»), тем же приёмом, что media-asset-insert.ts:
// бизнес-правила владения остаются в сервисе, здесь только сама запись.
import type { Model, UpdateQuery } from 'mongoose';
import { Types } from 'mongoose';
import type { DateTime } from 'luxon';
import {
  PAYMENT_NOTHING_TO_REVOKE_MESSAGE,
  type ConfirmPaymentInput,
} from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { isDuplicateKeyError } from '../common/mongo-error-codes';
import { encryptRecord } from '../utils/encryption';
import { decryptPayment, type RawLeanPayment } from './payment.mapper';
import {
  PAYMENT_ENCRYPT_SCHEMA,
  type PaymentRecord,
  type TelegramScreenshotSource,
} from './payment.schema';

/**
 * Upsert `(userId, month)` общий для всех, кто пишет в оплату:
 * confirmPayment, attachTelegramScreenshot (оба ниже) и приём снимка из
 * кабинета (payment-screenshot.write.ts) — jscpd: одна и та же гонка, один и
 * тот же приём лечения. E11000 на апсерте значит, что конкурент (второй
 * клик, ретрай сети, двойная отправка фото) успел вставить документ первым;
 * повтор апдейта без `upsert` находит уже вставленный. `update` целиком, а
 * не один `$set`: кабинету нужен ещё и `$unset` полей прежнего снимка.
 */
export async function upsertPaymentByFilter(
  model: Model<PaymentRecord>,
  filter: Record<string, unknown>,
  update: UpdateQuery<PaymentRecord>,
): Promise<RawLeanPayment> {
  try {
    const doc = await model
      .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
      .lean<RawLeanPayment>();
    return decryptPayment(doc);
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    const doc = await model
      .findOneAndUpdate(filter, update, { returnDocument: 'after' })
      .lean<RawLeanPayment | null>();
    // Крайний случай: конкурент успел вставить документ и удалить его до
    // повтора (двойной клик почти одновременно со снятием подтверждения) —
    // не проглатываем, иначе ответ соврёт об успешной записи.
    if (!doc) throw err;
    return decryptPayment(doc);
  }
}

/**
 * Идемпотентный upsert `(userId, month)` (ADR-0049): уже `paid` — тот же
 * документ, `confirmedAt` не двигается — второй клик по кнопке или ретрай
 * сети не переписывает момент подтверждения (и не подменяет уже принятые
 * сумму/заметку). `userId`/`month` в фильтре апдейта Mongo сам подставляет
 * в новый документ при апсерте — второй раз их в `$set` не пишем.
 */
export async function confirmPayment(
  model: Model<PaymentRecord>,
  userId: string,
  month: string,
  input: ConfirmPaymentInput,
  actorId: string,
  now: DateTime,
): Promise<RawLeanPayment> {
  const existing = await model.findOne({ userId, month }).lean<RawLeanPayment | null>();
  if (existing?.status === 'paid') return decryptPayment(existing);

  const payload = encryptRecord(
    {
      status: 'paid' as const,
      confirmedBy: new Types.ObjectId(actorId),
      confirmedAt: now.toJSDate(),
      ...(input.amountMinor !== undefined ? { amountMinor: input.amountMinor } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    PAYMENT_ENCRYPT_SCHEMA,
  );

  const filter = { userId: new Types.ObjectId(userId), month };
  return upsertPaymentByFilter(model, filter, { $set: payload });
}

/** Скриншот из бота (ADR-0050, слой 2.2) — upsert как у confirmPayment; `paid`
 * не трогаем (ADR-0049), иначе идём в `awaiting`. */
export async function attachTelegramScreenshot(
  model: Model<PaymentRecord>,
  userId: string,
  month: string,
  source: TelegramScreenshotSource,
  now: DateTime,
): Promise<RawLeanPayment> {
  const existing = await model.findOne({ userId, month }).lean<RawLeanPayment | null>();
  const payload = encryptRecord(
    {
      screenshotKind: 'telegram' as const,
      screenshotFileId: source.fileId,
      screenshotFileUniqueId: source.fileUniqueId,
      screenshotAt: now.toJSDate(),
      ...(existing?.status === 'paid' ? {} : { status: 'awaiting' as const }),
    },
    PAYMENT_ENCRYPT_SCHEMA,
  );

  const filter = { userId: new Types.ObjectId(userId), month };
  return upsertPaymentByFilter(model, filter, { $set: payload });
}

/**
 * Снятие подтверждения (ADR-0049): есть скриншот — назад в `awaiting`
 * (`confirmedBy`/`confirmedAt` снимаются); скриншота нет — документ уходит
 * целиком, месяц снова «не оплачен» (кроме самой отметки в нём ничего не
 * было). Нечего снимать (документа нет или он не `paid`) — понятный отказ,
 * не тихая запись поверх чужого состояния.
 */
export async function revokePayment(
  model: Model<PaymentRecord>,
  userId: string,
  month: string,
): Promise<RawLeanPayment | null> {
  const doc = await model.findOne({ userId, month }).lean<RawLeanPayment | null>();
  if (!doc || doc.status !== 'paid') {
    throw new ConflictError(PAYMENT_NOTHING_TO_REVOKE_MESSAGE);
  }

  if (doc.screenshotKind) {
    const updated = await model
      .findOneAndUpdate(
        { _id: doc._id },
        { $set: { status: 'awaiting' }, $unset: { confirmedBy: '', confirmedAt: '' } },
        { returnDocument: 'after' },
      )
      .lean<RawLeanPayment | null>();
    if (!updated) {
      throw new Error('revokePayment: документ не найден сразу после апдейта');
    }
    return decryptPayment(updated);
  }

  await model.deleteOne({ _id: doc._id });
  return null;
}
