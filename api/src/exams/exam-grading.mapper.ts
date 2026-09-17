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
} from './exam-grading.schema';

/** ExamGradingRecord как его отдаёт `.lean()` до расшифровки. `Pick<T, keyof T>`
 * вместо простого пересечения — тот же приём, что у `RawLeanExamAttempt`
 * (exam-attempt.mapper.ts): иначе тип не проходит ограничение
 * `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanExamGrading = Pick<ExamGradingRecord, keyof ExamGradingRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** После удаления баллов по критериям (рубрика удалена с концами,
 * ADR-0038) в записи не осталось полей, хранящихся строкой
 * целиком, — расшифровывать нужен только `comment` (enc), форма документа
 * до и после расшифровки одна и та же. Функция остаётся тонкой обёрткой над
 * `decryptRecord`, а не инлайнится в вызывающий код, — одна точка расшифровки
 * оценки на всех читателей (ExamGradingsService, MyExamsService). */
export function decryptGrading(doc: RawLeanExamGrading): RawLeanExamGrading {
  return decryptRecord(doc, EXAM_GRADING_ENCRYPT_SCHEMA);
}

export function toGradingDto(doc: RawLeanExamGrading): ExamGradingDto {
  return {
    id: doc._id.toString(),
    attemptId: doc.attemptId.toString(),
    examId: doc.examId.toString(),
    userId: doc.userId.toString(),
    graderId: doc.graderId.toString(),
    comment: doc.comment,
    outcome: doc.outcome,
    gradedAt: toIsoUtc(doc.gradedAt),
  };
}
