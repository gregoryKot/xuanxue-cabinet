// Единственный маппер LessonRecord (lean, уже расшифрованный) → LessonDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается —
// `recordingPromptedAt` в DTO нет ни строкой, ни намёком).
import type { Types } from 'mongoose';
import type {
  BroadcastStatus,
  LessonDto,
  Recording,
  RecordingDto,
} from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LessonRecord } from './lesson.schema';

/** LessonRecord с полями, которые Mongoose добавляет сам (`_id`,
 * `timestamps: true`), плюс записи в форме `.lean()` — субдокумент не теряет
 * `_id` даже без явного `{ _id: true }` в схеме. `tags` — честно
 * необязателен: у дат занятий, заведённых до ADR-0075, поля в документе нет,
 * а `.lean()` default схемы при чтении не подставляет — toLessonDto ниже сам
 * отдаёт `[]` (тот же приём, что у RawLeanMaterial, material.mapper.ts). */
export type LeanLesson = Omit<LessonRecord, 'recordings' | 'tags'> & {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  leaderId?: Types.ObjectId;
  ruleId?: Types.ObjectId;
  recordings: (Recording & { _id: Types.ObjectId })[];
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
};

/**
 * `linkBroadcastStatus` — статус рассылки-ссылки этого занятия (`kind:
 * 'lesson_link'`), если она уже создана планировщиком; отдельный параметр,
 * не поле LeanLesson — рассылка лежит в другой коллекции, LessonsService.list
 * находит статусы одним `find({ lessonId: { $in }, kind: 'lesson_link' })`
 * на весь список и передаёт сюда по одному (docs/PLAN.md §6 п.3, без N+1).
 */
export function toLessonDto(
  doc: LeanLesson,
  linkBroadcastStatus?: BroadcastStatus,
): LessonDto {
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
    broadcast: linkBroadcastStatus
      ? { status: linkBroadcastStatus, kind: 'lesson_link' }
      : undefined,
    tags: doc.tags ?? [],
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
