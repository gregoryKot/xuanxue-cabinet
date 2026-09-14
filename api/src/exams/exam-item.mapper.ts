// Единственный маппер ExamItemRecord (lean, уже расшифрованный) → ExamItemDto
// (CLAUDE.md, раздел «API»: документ Mongoose наружу не возвращается).
import type { Types } from 'mongoose';
import type { ExamItemDto } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import { decryptRecord } from '../utils/encryption';
import {
  EXAM_ITEM_ENCRYPT_SCHEMA,
  type ExamItemOptionRecord,
  type ExamItemRecord,
  type ExamItemVersionRecord,
} from './exam-item.schema';

/** ExamItemRecord как его отдаёт `.lean()` до расшифровки — `options`/
 * `history` ещё строка (encJson, exam-item.schema.ts), не разобранный
 * массив. `Pick<T, keyof T>` вместо простого пересечения с `ExamItemRecord` —
 * иначе тип не проходит ограничение `T extends Record<string, unknown>` у
 * `decryptRecord` (тот же приём, что `Omit<...>` у `LeanClass`/`LeanChannel` в
 * class.mapper.ts/channel.mapper.ts: там он не пустой лишь потому, что им
 * нужно убрать поле, здесь — только ради самого приёма). */
export type RawLeanExamItem = Pick<ExamItemRecord, keyof ExamItemRecord> & {
  _id: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

/** То же самое после `decryptRecord` и разбора JSON (см.
 * `ExamItemsService.decrypt`) — `options`/`history` уже настоящие массивы,
 * форма совпадает с `ExamItemOptionDto`/`ExamItemVersionDto` из shared. */
export type LeanExamItem = Omit<RawLeanExamItem, 'options' | 'history'> & {
  options: ExamItemOptionRecord[];
  history: ExamItemVersionRecord[];
};

/** `options`/`history` хранятся строкой (encJson, exam-item.schema.ts) —
 * decryptRecord возвращает их с тем же типом `string`, хотя на деле это уже
 * разобранный JSON; приводим явно один раз здесь (тот же приём, что
 * decryptAttempt/decryptGrading). Используют и ExamItemsService, и
 * ExamItemStatsService (слой 4.8, exam-item-stats.service.ts) — вторая
 * читает вопросы банка напрямую, минуя сервис, ради статистики по всему
 * банку разом (CLAUDE.md «Одна механика — один компонент»: расшифровка
 * записи вопроса — одно место, не второе рядом). */
export function decryptExamItem(doc: RawLeanExamItem): LeanExamItem {
  const decrypted = decryptRecord(doc, EXAM_ITEM_ENCRYPT_SCHEMA);
  return {
    ...decrypted,
    options: decrypted.options as unknown as ExamItemOptionRecord[],
    history: decrypted.history as unknown as ExamItemVersionRecord[],
  };
}

export function toExamItemDto(doc: LeanExamItem): ExamItemDto {
  return {
    id: doc._id.toString(),
    kind: doc.kind,
    prompt: doc.prompt,
    hint: doc.hint,
    criteria: doc.criteria,
    options: doc.options,
    tags: doc.tags,
    status: doc.status,
    version: doc.version,
    history: doc.history,
    authorId: doc.authorId?.toString(),
    createdAt: toIsoUtc(doc.createdAt),
    updatedAt: toIsoUtc(doc.updatedAt),
  };
}
