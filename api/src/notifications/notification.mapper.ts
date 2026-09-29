// Единственный маппер NotificationRecord (lean) → NotificationDto (CLAUDE.md
// «API»: документ Mongoose наружу не возвращается). Здесь же расшифровывается
// `examTitle` (единственное `enc`-поле записи) и здесь же собирается строка
// для показа — клиент получает `text` готовым и своих формулировок не держит
// (notification-text.ts, причина — шапка notification.schema.ts).
//
// Само название формы/класса наружу не уходит отдельным полем: оно нужно
// ровно для того, чтобы собрать `text`, а второе поле с тем же содержимым
// соблазняло бы клиент собрать строку заново — вторая формулировка в другом
// файле разъехалась бы с этой на первой же правке (CLAUDE.md «Одна механика
// — один компонент»).
import type { Types } from 'mongoose';
import { formatMonthRu, type NotificationDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { notificationText } from './notification-text';
import {
  NOTIFICATION_ENCRYPT_SCHEMA,
  type NotificationRecord,
} from './notification.schema';

/** `Pick<T, keyof T>` вместо простого пересечения — тот же приём, что у
 * `RawLeanExamGrading` (exam-grading.mapper.ts): иначе тип не проходит
 * ограничение `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanNotification = Pick<NotificationRecord, keyof NotificationRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
};

// Третий «заголовок» строки — месяц оплаты: хранится ключом 'YYYY-MM', а
// «сентябрь 2026» собирается здесь, на чтении (ADR-0150, тот же довод, что у
// самого текста — шапка notification.schema.ts).
function titleOf(
  doc: Pick<NotificationRecord, 'examTitle' | 'lessonTitle' | 'paymentMonth'>,
) {
  if (doc.paymentMonth !== undefined) return formatMonthRu(doc.paymentMonth);
  return doc.examTitle ?? doc.lessonTitle;
}

export function toNotificationDto(raw: RawLeanNotification): NotificationDto {
  const doc = decryptRecord(raw, NOTIFICATION_ENCRYPT_SCHEMA);
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    text: notificationText({ kind: doc.kind, title: titleOf(doc) }),
    examId: doc.examId,
    attemptId: doc.attemptId,
    lessonId: doc.lessonId,
    outcome: doc.outcome,
    readAt: doc.readAt ? toIsoUtc(doc.readAt) : undefined,
    createdAt: toIsoUtc(doc.createdAt),
  };
}
