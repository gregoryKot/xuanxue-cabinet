// Вопросы банка по списку id — одним запросом `$in`, не findOne на каждый.
// Старт попытки (createAttempt, exam-attempt-start.ts) грузил вопросы снимка
// по одному через ExamItemsService.getById: «Форма 1» — 56 вопросов, то есть
// 65 операций Mongo на одно нажатие «Начать». Atlas M0 даёт 100 операций в
// секунду на весь кластер, и 60 учеников, нажавших «Начать» в одну минуту,
// ставили базу в очередь на ~40 с (нагрузочный тест, аудит 2026-10-01).
// Теперь старт стоит ~10 операций при любом числе вопросов; что запрос один,
// держит регрессионный тест в exam-attempts.service.spec.ts.
import type { Model } from 'mongoose';
import { EXAM_ITEM_NOT_FOUND_MESSAGE, type ExamItemDto } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { NOT_DELETED } from '../common/soft-delete';
import type { ExamItemRecord } from './exam-item.schema';
import { decryptExamItem, toExamItemDto, type RawLeanExamItem } from './exam-item.mapper';

/** `includeDeleted` (ADR-0140) — форма может ссылаться на вопрос, уже
 * удалённый из банка: снимок попытки берёт и его, пока учитель сам не убрал
 * вопрос из блока. Любой id без документа — NotFoundError с тем же текстом,
 * что у `ExamItemsService.getById`: вопрос формы не пропускается молча. */
export async function findExamItemsByIds(
  model: Model<ExamItemRecord>,
  ids: readonly string[],
  includeDeleted: boolean,
): Promise<Map<string, ExamItemDto>> {
  const unique = [...new Set(ids)];
  for (const id of unique) assertObjectId(id, EXAM_ITEM_NOT_FOUND_MESSAGE);
  if (unique.length === 0) return new Map();

  const filter = includeDeleted
    ? { _id: { $in: unique } }
    : { _id: { $in: unique }, ...NOT_DELETED };
  const docs = await model.find(filter).lean<RawLeanExamItem[]>();
  const byId = new Map<string, ExamItemDto>();
  for (const doc of docs) {
    const item = toExamItemDto(decryptExamItem(doc));
    byId.set(item.id, item);
  }
  if (unique.some((id) => !byId.has(id))) {
    throw new NotFoundError(EXAM_ITEM_NOT_FOUND_MESSAGE);
  }
  return byId;
}
