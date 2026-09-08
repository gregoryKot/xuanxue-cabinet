// Единственный маппер BroadcastRecord (lean, уже расшифрованный) →
// BroadcastDto (CLAUDE.md, раздел «API»: документ Mongoose наружу не
// возвращается — previewSentAt/teacherNotifiedAt в DTO нет).
import type { Types } from 'mongoose';
import type { BroadcastDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { BroadcastRecord } from './broadcast.schema';

// Omit — не только «убрать поле»: гомоморфный mapped type, который делает
// пересечение совместимым с `Record<string, unknown>` для decryptRecord
// (encryptRecord обобщён по T extends Record<string, unknown>, «голый» класс
// Mongoose туда не проходит — тот же приём, что у LeanClass/LeanLesson).
export type LeanBroadcast = Omit<BroadcastRecord, 'lessonId'> & {
  _id: Types.ObjectId;
  lessonId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function toBroadcastDto(doc: LeanBroadcast): BroadcastDto {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    status: doc.status,
    text: doc.text,
    scheduledAt: toIsoUtc(doc.scheduledAt),
    sentAt: doc.sentAt ? toIsoUtc(doc.sentAt) : undefined,
    lessonId: doc.lessonId?.toString(),
    channelIds: doc.channelIds.map((id) => id.toString()),
    telegramFileId: doc.telegramFileId,
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
