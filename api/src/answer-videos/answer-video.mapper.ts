// Единственный маппер AnswerVideoRecord (lean) → AnswerVideoUploadDto
// (CLAUDE.md «API»): `key`/`uploadId` не уходят в DTO — адрес объекта в R2
// не должен утечь мимо подписанной ссылки (FileStoreService.signedGetUrl).
import type { Types } from 'mongoose';
import type { AnswerVideoUploadDto } from '@xuanxue/shared';
import { ANSWER_VIDEO_LIMITS } from '@xuanxue/shared';
import type { AnswerVideoRecord } from './answer-video.schema';

export type RawLeanAnswerVideo = Pick<AnswerVideoRecord, keyof AnswerVideoRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function partCountFor(sizeBytes: number): number {
  return Math.ceil(sizeBytes / ANSWER_VIDEO_LIMITS.partBytes);
}

export function toAnswerVideoUploadDto(doc: RawLeanAnswerVideo): AnswerVideoUploadDto {
  return {
    id: doc._id.toString(),
    partBytes: ANSWER_VIDEO_LIMITS.partBytes,
    partCount: partCountFor(doc.sizeBytes),
    receivedParts: doc.parts.map((part) => part.n).sort((a, b) => a - b),
  };
}
