// Привязка снимка перевода ИЗ КАБИНЕТА к записи оплаты (ADR-0050,
// docs/PLAN.md §15 слой 2.2) — рядом с `attachTelegramScreenshot`
// (payments.write.ts), но своим файлом: у пути кабинета есть то, чего нет у
// бота, — прежние байты в `payment_screenshots`, которые надо вернуть
// вызывающему на удаление. Гонку по уникальному `(userId, month)` разбирает
// общий `upsertPaymentByFilter`, не своя копия.
import type { Model } from 'mongoose';
import { Types } from 'mongoose';
import type { DateTime } from 'luxon';
import type { RawLeanPayment } from './payment.mapper';
import type { PaymentRecord } from './payment.schema';
import { upsertPaymentByFilter } from './payments.write';

export interface AttachedScreenshot {
  payment: RawLeanPayment;
  /** Снимок, который этот заменил, — его байты уходят следом: у оплаты один
   * снимок, а не история попыток показать чек. Пусто — заменять нечего. */
  previousImageId?: Types.ObjectId;
}

/**
 * Повтор не заводит второй абонемент и не сбрасывает подтверждение (PLAN §15,
 * слой 2.2): новый снимок ложится в тот же документ по уникальному
 * `(userId, month)`, а подтверждённый месяц остаётся подтверждённым —
 * деньги уже приняты, и второе фото не повод отменять решение бухгалтера.
 */
export async function attachUploadedScreenshot(
  model: Model<PaymentRecord>,
  userId: string,
  month: string,
  imageId: Types.ObjectId,
  now: DateTime,
): Promise<AttachedScreenshot> {
  const filter = { userId: new Types.ObjectId(userId), month };
  const existing = await model.findOne(filter).lean<RawLeanPayment | null>();
  const keepsPaid = existing?.status === 'paid';

  const doc = await upsertPaymentByFilter(model, filter, {
    $set: {
      screenshotKind: 'upload' as const,
      screenshotImageId: imageId,
      // От этой даты считается срок хранения снимка без подтверждения
      // (ADR-0050, 90 дней) — она же двигается при замене.
      screenshotAt: now.toJSDate(),
      ...(keepsPaid ? {} : { status: 'awaiting' as const }),
    },
    // Прежний снимок мог прийти боту (`kind: 'telegram'`): его `file_id`
    // ведёт к фото, которое эта запись больше не показывает, — хранить
    // дальше нечего (SECURITY §5).
    $unset: { screenshotFileId: '', screenshotFileUniqueId: '' },
  });

  return {
    payment: doc,
    ...(existing?.screenshotImageId
      ? { previousImageId: existing.screenshotImageId }
      : {}),
  };
}
