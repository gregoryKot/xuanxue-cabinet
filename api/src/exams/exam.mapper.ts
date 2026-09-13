// Единственный маппер ExamRecord (lean, уже расшифрованный) → ExamDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается).
import type { Types } from 'mongoose';
import type { ExamDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { ExamBlockRecord, ExamRecord, RubricCriterionRecord } from './exam.schema';

/** ExamRecord как его отдаёт `.lean()` до расшифровки — `blocks` ещё строка
 * (encJson, exam.schema.ts), не разобранный массив. `Pick<T, keyof T>` вместо
 * простого пересечения с `ExamRecord` — тот же приём, что у `RawLeanExamItem`
 * (exam-item.mapper.ts): иначе тип не проходит ограничение
 * `T extends Record<string, unknown>` у `decryptRecord`. */
export type RawLeanExam = Pick<ExamRecord, keyof ExamRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** То же самое после `decryptRecord` и разбора JSON (см.
 * `ExamsService.decrypt`) — `blocks` уже настоящий массив, форма совпадает с
 * `ExamBlockDto` из shared. */
export type LeanExam = Omit<RawLeanExam, 'blocks' | 'rubric'> & {
  blocks: ExamBlockRecord[];
  rubric: RubricCriterionRecord[];
};

export function toExamDto(doc: LeanExam): ExamDto {
  return {
    id: doc._id.toString(),
    title: doc.title,
    // `description`/`level` — единственные поля со схемным default (''), для
    // которых NULLABLE_EXAM_FIELDS всё равно допускает `null` → `$unset`
    // (shared/src/exams.ts): `.lean()` не переприменяет default к документу,
    // из которого поле физически удалили (default — поведение гидратации
    // Document, не голого запроса), поэтому здесь — на возврате в DTO.
    description: doc.description ?? '',
    level: doc.level ?? '',
    blocks: doc.blocks,
    rubric: doc.rubric,
    timeLimitMin: doc.timeLimitMin,
    attemptsAllowed: doc.attemptsAllowed,
    status: doc.status,
    createdBy: doc.createdBy?.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
