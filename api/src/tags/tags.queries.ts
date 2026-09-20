// Агрегации для сводки тегов школы (GET /api/tags, ADR-0059, ADR-0074) — две
// независимые агрегации по двум коллекциям, без денормализации (ADR-0059
// «Последствия»: хранёный счётчик разъехался бы с первой правкой в обход
// него). `tags` у всех трёх схем не шифруется (plain, class.schema.ts/
// lesson.schema.ts/material.schema.ts) — агрегация работает прямо в Mongo,
// без расшифровки в приложении.
import type { Model } from 'mongoose';
import type { TagSummaryDto } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from '../lessons/lesson.schema';
import type { MaterialRecord } from '../materials/material.schema';

interface TagCountRow {
  _id: string;
  count: number;
}

/** Тег → число материалов с ним, по всей библиотеке. `$unwind` на
 * отсутствующем или пустом `tags` сам исключает документ без тегов —
 * специального случая для материалов до ADR-0058 не нужно. */
export async function countMaterialsByTag(
  model: Model<MaterialRecord>,
): Promise<Map<string, number>> {
  const rows = await model.aggregate<TagCountRow>([
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/** Тег → число дат занятий с ним, с наследованием тега курса (ADR-0072):
 * `$lookup` подтягивает теги класса, `$setUnion` объединяет их со своими
 * тегами даты в одно множество без дублей — дата, у которой свой тег
 * совпадает с тегом курса, попадает в `$group` один раз, не дважды
 * (ADR-0074). `classModel.collection.name`, не строка `'classes'`: имя
 * коллекции берётся из схемы, а не дублируется здесь (CLAUDE.md «Без
 * магических чисел и строк»). */
export async function countLessonsByTag(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
): Promise<Map<string, number>> {
  const rows = await lessonModel.aggregate<TagCountRow>([
    {
      $lookup: {
        from: classModel.collection.name,
        localField: 'classId',
        foreignField: '_id',
        as: 'class',
      },
    },
    {
      $addFields: {
        effectiveTags: {
          $setUnion: [
            { $ifNull: ['$tags', []] },
            { $ifNull: [{ $arrayElemAt: ['$class.tags', 0] }, []] },
          ],
        },
      },
    },
    { $unwind: '$effectiveTags' },
    { $group: { _id: '$effectiveTags', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/**
 * Сводит обе агрегации в список сводки. Сортировка — по общему числу
 * упоминаний по убыванию: экран тега — список, по которому выбирают тег
 * (ADR-0059), и лимит должен резать самые редкие теги, а не произвольные по
 * алфавиту (ADR-0074 «число у тега считается тем же правилом, что и
 * выдача» — тот же дух: полезное остаётся, редкое обрезается). Тег с равной
 * суммой — по названию, чтобы порядок не менялся от запроса к запросу.
 */
export function mergeTagSummaries(
  lessonCounts: Map<string, number>,
  materialCounts: Map<string, number>,
): TagSummaryDto[] {
  const tags = new Set([...lessonCounts.keys(), ...materialCounts.keys()]);
  return [...tags]
    .map((tag) => ({
      tag,
      lessonCount: lessonCounts.get(tag) ?? 0,
      materialCount: materialCounts.get(tag) ?? 0,
    }))
    .sort((a, b) => {
      const byTotal = b.lessonCount + b.materialCount - (a.lessonCount + a.materialCount);
      return byTotal !== 0 ? byTotal : a.tag.localeCompare(b.tag, 'ru');
    });
}
