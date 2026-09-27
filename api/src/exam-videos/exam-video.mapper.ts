// Единственный маппер ExamVideoRecord (lean) → ExamVideoDto (CLAUDE.md
// «API»: документ Mongoose наружу не возвращается). `key` не уходит в DTO —
// адрес объекта в R2 не должен утечь мимо подписанной ссылки
// (FileStoreService.signedGetUrl).
import type { Types } from 'mongoose';
import type { ExamVideoDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { EXAM_VIDEO_ENCRYPT_SCHEMA, type ExamVideoRecord } from './exam-video.schema';

export type RawLeanExamVideo = Pick<ExamVideoRecord, keyof ExamVideoRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** `telegramFileId` расшифрован — тот же приём, что decryptExamImage
 * (exam-image.mapper.ts). DTO наружу (toExamVideoDto ниже) его не отдаёт —
 * ведёт к файлу у конкретного бота, наружу незачем. */
export function decryptExamVideo(doc: RawLeanExamVideo): RawLeanExamVideo {
  return decryptRecord(doc, EXAM_VIDEO_ENCRYPT_SCHEMA);
}

export function toExamVideoDto(doc: RawLeanExamVideo): ExamVideoDto {
  return {
    id: doc._id.toString(),
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    createdAt: toIsoUtc(doc.createdAt),
  };
}
