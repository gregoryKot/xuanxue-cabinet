// Единственный маппер LessonVideoRecord (lean) → LessonVideoDto (CLAUDE.md «API»:
// документ Mongoose наружу не возвращается). `key` не уходит в DTO — адрес объекта
// в R2 не должен утечь мимо подписанной ссылки (FileStoreService.signedGetUrl).
import type { Types } from 'mongoose';
import type { ExamVideoContentType, LessonVideoDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { LessonVideoRecord } from './lesson-video.schema';

export type RawLeanLessonVideo = Pick<LessonVideoRecord, keyof LessonVideoRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** Готово — `status: 'ready'`. Одним предикатом на выборки (фильтр) и на документ,
 * чтобы уборщик и доступ не разошлись в понимании «готово». В отличие от
 * exam_videos, записей без поля `status` здесь не бывает: вид родился вместе с
 * загрузкой частями. */
export const LESSON_VIDEO_READY_FILTER = { status: 'ready' as const };

export function isLessonVideoReady(doc: Pick<RawLeanLessonVideo, 'status'>): boolean {
  return doc.status === 'ready';
}

/** Тип у готового видео есть всегда: его задаёт первая часть. Нет — повреждённая
 * запись, и она не должна молча уйти в плеер под выдуманным типом. */
function readyContentType(doc: RawLeanLessonVideo): ExamVideoContentType {
  if (!doc.contentType) {
    throw new Error(
      `lesson_videos ${doc._id.toString()}: у готового видео нет contentType`,
    );
  }
  return doc.contentType;
}

export function toLessonVideoDto(doc: RawLeanLessonVideo): LessonVideoDto {
  return {
    id: doc._id.toString(),
    contentType: readyContentType(doc),
    sizeBytes: doc.sizeBytes,
    createdAt: toIsoUtc(doc.createdAt),
  };
}
