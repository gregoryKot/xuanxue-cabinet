// Сборка фильтра GET /materials — отдельно от сервиса, тот же приём, что у
// lessons.queries.ts: сервис остаётся коротким оркестратором.
import { Types } from 'mongoose';
import type { ListMaterialsQuery } from '@xuanxue/shared';

/** `classId` не проходит `@IsMongoId()` в ListMaterialsDto нарочно (кривой id
 * — не ошибка формы, а фильтр без результатов). Здесь та же мысль в коде:
 * невалидный id — `null`, сервис не делает запрос вовсе и отдаёт пустой
 * список вместо CastError/500. */
export function buildMaterialsFilter(
  query: ListMaterialsQuery,
): Record<string, unknown> | null {
  const filter: Record<string, unknown> = {};
  if (query.classId !== undefined) {
    if (!Types.ObjectId.isValid(query.classId)) return null;
    filter.classIds = query.classId;
  }
  if (query.kind !== undefined) filter.kind = query.kind;
  return filter;
}
