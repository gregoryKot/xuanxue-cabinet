// Единственный маппер состояния загрузки (lean) → AnswerVideoUploadDto
// (CLAUDE.md «API») для всех видов видео: `key`/`uploadId` не уходят в DTO —
// адрес объекта в R2 не должен утечь мимо подписанной ссылки
// (FileStoreService.signedGetUrl). Тип DTO пока прежний, общий с web
// (shared/src/answer-videos.ts).
import type { Types } from 'mongoose';
import type { AnswerVideoUploadDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import type { VideoUploadRecord } from './video-upload.schema';

/** Запись загрузки как её отдаёт `.lean()`. Схема-наследник сужает её своими
 * полями (RawLeanAnswerVideo) — ядру нужны только общие. */
export type RawLeanVideoUpload = Pick<VideoUploadRecord, keyof VideoUploadRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function partCountFor(sizeBytes: number): number {
  return Math.ceil(sizeBytes / ANSWER_VIDEO_LIMITS.partBytes);
}

export function toVideoUploadDto(doc: RawLeanVideoUpload): AnswerVideoUploadDto {
  return {
    id: doc._id.toString(),
    partBytes: ANSWER_VIDEO_LIMITS.partBytes,
    partCount: partCountFor(doc.sizeBytes),
    receivedParts: doc.parts.map((part) => part.n).sort((a, b) => a - b),
  };
}
