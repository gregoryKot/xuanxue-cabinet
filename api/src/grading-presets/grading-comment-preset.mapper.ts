// Единственный маппер GradingCommentPresetRecord (lean, уже расшифрованный)
// → GradingCommentPresetDto (CLAUDE.md, раздел «API»: документ Mongoose
// наружу не возвращается).
import type { Types } from 'mongoose';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA,
  type GradingCommentPresetRecord,
} from './grading-comment-preset.schema';

/** GradingCommentPresetRecord как его отдаёт `.lean()` до расшифровки —
 * `Pick<T, keyof T>` вместо простого пересечения, тот же приём, что у
 * `RawLeanExamGrading` (exam-grading.mapper.ts). */
export type RawLeanGradingCommentPreset = Pick<
  GradingCommentPresetRecord,
  keyof GradingCommentPresetRecord
> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export function decryptGradingCommentPreset(
  doc: RawLeanGradingCommentPreset,
): RawLeanGradingCommentPreset {
  return decryptRecord(doc, GRADING_COMMENT_PRESET_ENCRYPT_SCHEMA);
}

export function toGradingCommentPresetDto(
  doc: RawLeanGradingCommentPreset,
): GradingCommentPresetDto {
  return {
    id: doc._id.toString(),
    text: doc.text,
    title: doc.title,
    createdBy: doc.createdBy.toString(),
    createdAt: toIsoUtc(doc.createdAt),
  };
}
