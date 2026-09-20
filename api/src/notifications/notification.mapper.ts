// Единственный маппер NotificationRecord (lean) → NotificationDto (CLAUDE.md
// «API»: документ Mongoose наружу не возвращается). Ни одно поле не
// шифруется (шапка notification.schema.ts) — расшифровывать нечего, в
// отличие от exam-grading.mapper.ts.
import type { Types } from 'mongoose';
import type { NotificationDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { NotificationRecord } from './notification.schema';

export type RawLeanNotification = Pick<NotificationRecord, keyof NotificationRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

export function toNotificationDto(doc: RawLeanNotification): NotificationDto {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    examId: doc.examId,
    attemptId: doc.attemptId,
    outcome: doc.outcome,
    readAt: doc.readAt ? toIsoUtc(doc.readAt) : undefined,
    createdAt: toIsoUtc(doc.createdAt),
  };
}
