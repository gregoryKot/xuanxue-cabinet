// Единственный маппер PaymentRecord (lean, уже расшифрованный) → PaymentDto/
// MyPaymentDto (CLAUDE.md «API»): документ Mongoose наружу не идёт —
// `screenshotFileId`/`screenshotFileUniqueId`/`note`/`_id`/`__v` в DTO вообще
// не попадают, только производное `hasScreenshot`.
import type { Types } from 'mongoose';
import type { MyPaymentDto, PaymentDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { PAYMENT_ENCRYPT_SCHEMA, type PaymentRecord } from './payment.schema';

/** PaymentRecord как его отдаёт `.lean()` до расшифровки — тот же приём, что
 * RawLeanMediaAsset (media-asset.mapper.ts). */
export type RawLeanPayment = Pick<PaymentRecord, keyof PaymentRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptPayment(doc: RawLeanPayment): RawLeanPayment {
  return decryptRecord(doc, PAYMENT_ENCRYPT_SCHEMA);
}

export function toPaymentDto(doc: RawLeanPayment, userName: string): PaymentDto {
  return {
    userId: doc.userId.toString(),
    userName,
    month: doc.month,
    status: doc.status,
    amountMinor: doc.amountMinor,
    confirmedAt: doc.confirmedAt ? toIsoUtc(doc.confirmedAt) : undefined,
    hasScreenshot: doc.screenshotKind != null,
    reminderSentAt: doc.reminderSentAt ? toIsoUtc(doc.reminderSentAt) : undefined,
  };
}

export function toMyPaymentDto(doc: RawLeanPayment): MyPaymentDto {
  return {
    month: doc.month,
    status: doc.status,
    amountMinor: doc.amountMinor,
    confirmedAt: doc.confirmedAt ? toIsoUtc(doc.confirmedAt) : undefined,
    hasScreenshot: doc.screenshotKind != null,
  };
}
