// Единственный маппер ExamRecord (lean, уже расшифрованный) → ExamDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается).
import type { Types } from 'mongoose';
import type { ExamBlockDto, ExamDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  EXAM_ENCRYPT_SCHEMA,
  type ExamBlockRecord,
  type ExamRecord,
  type RubricCriterionRecord,
} from './exam.schema';

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

/** То же самое после `decryptRecord` и разбора JSON (см. `decryptExam` ниже)
 * — `blocks` уже настоящий массив, форма совпадает с `ExamBlockDto` из
 * shared. */
export type LeanExam = Omit<RawLeanExam, 'blocks' | 'rubric'> & {
  blocks: ExamBlockRecord[];
  rubric: RubricCriterionRecord[];
};

/** `blocks`/`rubric` хранятся строкой (encJson, exam.schema.ts) —
 * decryptRecord (не параметризована по конкретному полю, как и у
 * `decryptExamItem`, exam-item.mapper.ts) возвращает их с тем же типом
 * `string`, хотя на деле это уже разобранный JSON; приводим явно один раз
 * здесь — единственное место расшифровки ПОЛНОГО документа формы
 * (ExamsService). exam-item-references.ts расшифровывает частичную выборку
 * `title`+`blocks` отдельно — там нет остальных полей `RawLeanExam`. */
export function decryptExam(doc: RawLeanExam): LeanExam {
  const decrypted = decryptRecord(doc, EXAM_ENCRYPT_SCHEMA);
  return {
    ...decrypted,
    blocks: decrypted.blocks as unknown as ExamBlockRecord[],
    rubric: decrypted.rubric as unknown as RubricCriterionRecord[],
  };
}

/** Блок собирается наружу по полям, а не отдаётся «как лежит в базе»
 * (CLAUDE.md «API»): у форм старше ADR-0033 в записи остался `required`, и
 * массив как есть отдал бы клиенту поле, которого в контракте больше нет. */
function toBlockDto(block: ExamBlockRecord): ExamBlockDto {
  return {
    id: block.id,
    title: block.title,
    itemIds: block.itemIds,
    shuffle: block.shuffle,
  };
}

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
    blocks: doc.blocks.map(toBlockDto),
    // `?? false` — у форм, созданных до ADR-0033, поля в документе нет, а
    // `.lean()` схемный default не переприменяет (та же причина, что у
    // description/level выше).
    shuffleOptions: doc.shuffleOptions ?? false,
    rubric: doc.rubric,
    timeLimitMin: doc.timeLimitMin,
    attemptsAllowed: doc.attemptsAllowed,
    status: doc.status,
    createdBy: doc.createdBy?.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
