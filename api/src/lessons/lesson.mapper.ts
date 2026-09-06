// Единственный маппер LessonRecord (lean, уже расшифрованный) → LessonDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается —
// `recordingPromptedAt` в DTO нет ни строкой, ни намёком).
import type { Types } from 'mongoose';
import type { LessonDto, Recording, RecordingDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LessonRecord } from './lesson.schema';

/** LessonRecord с полями, которые Mongoose добавляет сам (`_id`,
 * `timestamps: true`), плюс записи в форме `.lean()` — субдокумент не теряет
 * `_id` даже без явного `{ _id: true }` в схеме. */
export type LeanLesson = Omit<LessonRecord, 'recordings'> & {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  leaderId?: Types.ObjectId;
  ruleId?: Types.ObjectId;
  recordings: (Recording & { _id: Types.ObjectId })[];
  createdAt: Date;
  updatedAt: Date;
};

export function toLessonDto(doc: LeanLesson): LessonDto {
  return {
    id: doc._id.toString(),
    classId: doc.classId.toString(),
    plannedAt: doc.plannedAt ? toIsoUtc(doc.plannedAt) : undefined,
    startsAt: toIsoUtc(doc.startsAt),
    durationMin: doc.durationMin,
    topic: doc.topic,
    status: doc.status,
    leaderId: doc.leaderId?.toString(),
    ruleId: doc.ruleId?.toString(),
    zoomLinkOverride: doc.zoomLinkOverride,
    zoomPasswordOverride: doc.zoomPasswordOverride,
    recordings: doc.recordings.map(toRecordingDto),
    note: doc.note,
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}

function toRecordingDto(recording: Recording & { _id: Types.ObjectId }): RecordingDto {
  return {
    id: recording._id.toString(),
    title: recording.title,
    url: recording.url,
    telegramFileId: recording.telegramFileId,
  };
}
