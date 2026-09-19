// Сборка фильтра GET /materials — отдельно от сервиса, тот же приём, что у
// lessons.queries.ts: сервис остаётся коротким оркестратором.
import { Types, type Model } from 'mongoose';
import type { ListMaterialsQuery } from '@xuanxue/shared';
import type { MaterialRecord } from './material.schema';

/** `classId`/`lessonId` не проходят `@IsMongoId()` в ListMaterialsDto нарочно
 * (кривой id — не ошибка формы, а фильтр без результатов). Здесь та же мысль
 * в коде: невалидный id — `null`, сервис не делает запрос вовсе и отдаёт
 * пустой список вместо CastError/500. Оба фильтра в одном объекте — «И», не
 * «ИЛИ» (ADR-0056): материал должен подойти под обе привязки сразу. */
export function buildMaterialsFilter(
  query: ListMaterialsQuery,
): Record<string, unknown> | null {
  const filter: Record<string, unknown> = {};
  if (query.classId !== undefined) {
    if (!Types.ObjectId.isValid(query.classId)) return null;
    filter.classIds = query.classId;
  }
  if (query.lessonId !== undefined) {
    if (!Types.ObjectId.isValid(query.lessonId)) return null;
    filter.lessonIds = query.lessonId;
  }
  if (query.kind !== undefined) filter.kind = query.kind;
  // `tag` — просто @IsString() (list-materials.dto.ts), пустая строка
  // проходит валидацию; истинностная проверка (не `!== undefined`) не даёт
  // ей превратиться в фильтр «тег — пустая строка», который отдал бы
  // пустой список вместо «фильтр не задан» (тот же исход, что нужен и для
  // некорректного classId выше).
  if (query.tag) filter.tags = query.tag;
  return filter;
}

/** Отвязка материалов от удалённой сущности — id пропадает из привязки, сам
 * материал остаётся в библиотеке (ADR-0056 «Последствия», ADR-0047
 * «Последствия»). Один приём для обеих привязок: `LessonsService.remove`
 * зовёт с `lessonIds` при удалении даты занятия, `ClassesService.remove` — с
 * `classIds` при удалении занятия расписания. */
export async function detachMaterialReference(
  model: Model<MaterialRecord>,
  field: 'classIds' | 'lessonIds',
  id: string,
): Promise<void> {
  await model.updateMany({ [field]: id }, { $pull: { [field]: id } });
}
