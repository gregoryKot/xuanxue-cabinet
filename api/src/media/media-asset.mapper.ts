// Единственный маппер MediaAssetRecord (lean, уже расшифрованный) →
// ExamMediaDto (CLAUDE.md «API»): документ Mongoose наружу не идёт, и в
// частности fileId/fileUniqueId — они ведут к самому видео (комментарий у
// ExamMediaDto, shared/src/exam-media.ts) — в DTO вообще не попадают.
import type { Types } from 'mongoose';
import type { ExamMediaDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import { MEDIA_ASSET_ENCRYPT_SCHEMA, type MediaAssetRecord } from './media-asset.schema';

/** MediaAssetRecord как его отдаёт `.lean()` до расшифровки. `Pick<T, keyof T>`
 * вместо простого пересечения — тот же приём, что у `RawLeanExamAttempt`
 * (exam-attempt.mapper.ts): иначе тип не проходит ограничение
 * `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanMediaAsset = Pick<MediaAssetRecord, keyof MediaAssetRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptMediaAsset(doc: RawLeanMediaAsset): RawLeanMediaAsset {
  return decryptRecord(doc, MEDIA_ASSET_ENCRYPT_SCHEMA);
}

export function toExamMediaDto(doc: RawLeanMediaAsset): ExamMediaDto {
  return {
    id: doc._id.toString(),
    attemptId: doc.attemptId.toString(),
    itemId: doc.itemId?.toString(),
    kind: doc.kind,
    url: doc.kind === 'link' ? doc.url : undefined,
    durationSec: doc.kind === 'telegram' ? doc.durationSec : undefined,
    sizeBytes: doc.kind === 'telegram' ? doc.sizeBytes : undefined,
    receivedAt: toIsoUtc(doc.receivedAt),
    note: doc.note,
  };
}
