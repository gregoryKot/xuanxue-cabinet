// Агрегации для сводки тегов школы (GET /api/tags, ADR-0075, ADR-0078,
// ADR-0116) — две независимые агрегации (занятия, материалы), без
// денормализации (ADR-0075 «Последствия»: хранёный счётчик разъехался бы с
// первой правкой в обход него). `tags` не шифруется ни у одной из схем
// (plain, class.schema.ts/lesson.schema.ts/material.schema.ts) — агрегация
// работает прямо в Mongo, без расшифровки в приложении. Вопрос экзамена
// (ADR-0128) и канал (ADR-0192) тегов больше не несут — их счёт убран.
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
 * отсутствующем или пустом `tags` сам исключает материал без тегов —
 * специального случая не нужно. Дате занятия с наследованием тега курса это
 * не подходит (`countLessonsByTag`, свой `$lookup`), у неё своя агрегация. */
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
 * (ADR-0078). `classModel.collection.name`, не строка `'classes'`: имя
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
 * Сводит две агрегации в список сводки. Сортировка — по общему числу
 * упоминаний по убыванию: список показывается пилюлями, из которых выбирают
 * тег (ADR-0075, ADR-0116), и наверху должны быть теги, которыми школа
 * реально пользуется, а не случайный алфавитный порядок. Тег с равной
 * суммой — по названию (`localeCompare` с русской локалью, как сортируются
 * остальные списки школы), чтобы порядок не менялся от запроса к запросу.
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
      const totalOf = (row: TagSummaryDto): number => row.lessonCount + row.materialCount;
      const byTotal = totalOf(b) - totalOf(a);
      return byTotal !== 0 ? byTotal : a.tag.localeCompare(b.tag, 'ru');
    });
}
