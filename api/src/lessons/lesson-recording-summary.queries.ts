// Запросы числа записей (lesson-recording-summary.service.ts) — два
// countDocuments по индексу `{ status: 1, startsAt: 1 }` (lesson.schema.ts),
// без выгрузки занятий в память (CLAUDE.md «API»). Два отдельных запроса
// вместо одной агрегации — по образцу summary.queries.ts: читаются как два
// предложения, а не как конвейер стадий; школа на полсотни занятий за период
// не почувствует разницы в цене запроса.
import type { Model } from 'mongoose';
import type { LessonRecord } from './lesson.schema';

// Отменённое занятие не в счёт нигде: записи у него по определению не
// бывает, и включать его в знаменатель «сколько занятий прошло» — нечестно
// перед учителем (ТЗ docs/PLAN.md §14, слой 3.5).
const CANCELLED_STATUS = 'cancelled';

export function countLessonsPast(
  model: Model<LessonRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({
    startsAt: { $gte: from, $lte: to },
    status: { $ne: CANCELLED_STATUS },
  });
}

/** `recordings: { $ne: [] }` — точное сравнение с пустым массивом: любой
 * непустой массив (порядок и содержимое элементов роли не играют) ему не
 * равен, поле всегда массив (`default: []` в схеме), `$exists` не нужен. */
export function countLessonsWithRecording(
  model: Model<LessonRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({
    startsAt: { $gte: from, $lte: to },
    status: { $ne: CANCELLED_STATUS },
    recordings: { $ne: [] },
  });
}
