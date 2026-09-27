// Помощник для ExamAttemptsService.list (ADR-0140, файл-лимит 230 строк не
// растёт, CLAUDE.md «Храповики») — форма удаляется мягко (deletedAt, а не
// пропадает документом), и попытки удалённой формы не должны всплывать в
// списке ни ученику, ни штату, хотя сами документы попыток остаются в базе
// нетронутыми. `examId` в exam_attempts хранится `ObjectId` (exam-attempt.
// schema.ts), но Mongoose сам приводит валидную hex-строку в фильтре —
// возвращаем строки, тем же представлением, что и остальной код сервиса.
import type { Model, Types } from 'mongoose';
import type { ListAttemptsQuery } from '@xuanxue/shared';
import type { ExamRecord } from './exam.schema';

/** id всех удалённых форм — десятки, не тысячи (тот же порядок величины,
 * что у exam-item-references.ts), выборка одного поля вместо `.distinct()`:
 * у `_id` нет явного пути в схеме, а `.distinct('_id', …)` от этого типизирован
 * как `unknown[]`. */
export async function deletedExamIds(examModel: Model<ExamRecord>): Promise<string[]> {
  const docs = await examModel
    .find({ deletedAt: { $ne: null } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>();
  return docs.map((doc) => doc._id.toString());
}

/** Фрагмент фильтра списка попыток по видимости формы. Если `queryExamId`
 * сам указывает на удалённую форму — результат должен быть пустым, а не
 * «фильтр по examId проигнорирован» (`$in: []` не совпадает ни с чем);
 * иначе, без явного examId, вычитаем все удалённые формы разом. */
export function examIdVisibilityFilter(
  deletedIds: readonly string[],
  queryExamId: string | undefined,
): Record<string, unknown> | undefined {
  if (queryExamId !== undefined) {
    return deletedIds.includes(queryExamId)
      ? { examId: { $in: [] } }
      : { examId: queryExamId };
  }
  return deletedIds.length > 0 ? { examId: { $nin: deletedIds } } : undefined;
}

/** Весь фильтр `ExamAttemptsService.list` разом — вынесено сюда целиком
 * (не только видимость формы), чтобы сам сервис не растил файл-лимит
 * 230 строк на эту логику ни на одну лишнюю строку. */
export function buildAttemptListFilter(
  deletedIds: readonly string[],
  query: ListAttemptsQuery,
  isStaff: boolean,
  userId: string,
): Record<string, unknown> {
  const filter = examIdVisibilityFilter(deletedIds, query.examId) ?? {};
  if (!isStaff) filter.userId = userId;
  if (query.status !== undefined) filter.status = query.status;
  return filter;
}
