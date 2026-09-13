// Единственный маппер ExamGradingRecord (lean, уже расшифрованный) →
// ExamGradingDto (CLAUDE.md, раздел «API»: документ Mongoose наружу не
// возвращается).
import type { Types } from 'mongoose';
import type { ExamGradingDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  EXAM_GRADING_ENCRYPT_SCHEMA,
  type ExamGradingRecord,
  type GradingCriterionRecord,
} from './exam-grading.schema';

/** ExamGradingRecord как его отдаёт `.lean()` до расшифровки — `criteria`
 * ещё строка (encJson, exam-grading.schema.ts). `Pick<T, keyof T>` вместо
 * простого пересечения — тот же приём, что у `RawLeanExamAttempt`
 * (exam-attempt.mapper.ts): иначе тип не проходит ограничение
 * `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanExamGrading = Pick<ExamGradingRecord, keyof ExamGradingRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** То же самое после `decryptRecord` и разбора JSON (см. `decryptGrading`
 * ниже) — `criteria` уже настоящий массив. */
export type LeanExamGrading = Omit<RawLeanExamGrading, 'criteria'> & {
  criteria: GradingCriterionRecord[];
};

/** `criteria` хранится строкой (encJson) — decryptRecord (не параметризована
 * по конкретному полю, тот же приём, что у ExamsService.decrypt) возвращает
 * её с тем же типом `string`, хотя на деле это уже разобранный JSON;
 * приводим явно один раз здесь. */
export function decryptGrading(doc: RawLeanExamGrading): LeanExamGrading {
  const decrypted = decryptRecord(doc, EXAM_GRADING_ENCRYPT_SCHEMA);
  return {
    ...decrypted,
    criteria: decrypted.criteria as unknown as GradingCriterionRecord[],
  };
}

export function toGradingDto(doc: LeanExamGrading): ExamGradingDto {
  return {
    id: doc._id.toString(),
    attemptId: doc.attemptId.toString(),
    examId: doc.examId.toString(),
    userId: doc.userId.toString(),
    graderId: doc.graderId.toString(),
    criteria: doc.criteria,
    comment: doc.comment,
    outcome: doc.outcome,
    gradedAt: toIsoUtc(doc.gradedAt),
  };
}
