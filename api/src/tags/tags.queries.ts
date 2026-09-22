// Агрегации для сводки тегов школы (GET /api/tags, ADR-0075, ADR-0078,
// ADR-0116) — четыре независимые агрегации по четырём коллекциям, без
// денормализации (ADR-0075 «Последствия»: хранёный счётчик разъехался бы с
// первой правкой в обход него). `tags` не шифруется ни у одной из схем
// (plain, class.schema.ts/lesson.schema.ts/material.schema.ts/
// channel.schema.ts/exam-item.schema.ts) — агрегация работает прямо в Mongo,
// без расшифровки в приложении.
import type { Model } from 'mongoose';
import type { TagSummaryDto } from '@xuanxue/shared';
import type { ChannelRecord } from '../channels/channel.schema';
import type { ClassRecord } from '../classes/class.schema';
import type { ExamItemRecord } from '../exams/exam-item.schema';
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

/** Тег → число каналов школы с ним (ADR-0108, ADR-0116). Личный канал
 * ученика (`broadcastEligible: false`, ADR-0027) не считается — это не
 * канал школы, тот же фильтр, что `ChannelsService.list`. */
export async function countChannelsByTag(
  model: Model<ChannelRecord>,
): Promise<Map<string, number>> {
  const rows = await model.aggregate<TagCountRow>([
    { $match: { broadcastEligible: { $ne: false } } },
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/** Тег → число вопросов банка экзамена с ним, по всей истории школы. */
export async function countExamItemsByTag(
  model: Model<ExamItemRecord>,
): Promise<Map<string, number>> {
  const rows = await model.aggregate<TagCountRow>([
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

/**
 * Сводит четыре агрегации в список сводки. Сортировка — по общему числу
 * упоминаний по убыванию: список показывается пилюлями, из которых выбирают
 * тег (ADR-0075, ADR-0116), и наверху должны быть теги, которыми школа
 * реально пользуется, а не случайный алфавитный порядок. Тег с равной
 * суммой — по названию (`localeCompare` с русской локалью, как сортируются
 * остальные списки школы), чтобы порядок не менялся от запроса к запросу.
 */
export function mergeTagSummaries(
  lessonCounts: Map<string, number>,
  materialCounts: Map<string, number>,
  channelCounts: Map<string, number>,
  examItemCounts: Map<string, number>,
): TagSummaryDto[] {
  const tags = new Set([
    ...lessonCounts.keys(),
    ...materialCounts.keys(),
    ...channelCounts.keys(),
    ...examItemCounts.keys(),
  ]);
  return [...tags]
    .map((tag) => ({
      tag,
      lessonCount: lessonCounts.get(tag) ?? 0,
      materialCount: materialCounts.get(tag) ?? 0,
      channelCount: channelCounts.get(tag) ?? 0,
      examItemCount: examItemCounts.get(tag) ?? 0,
    }))
    .sort((a, b) => {
      const totalOf = (row: TagSummaryDto): number =>
        row.lessonCount + row.materialCount + row.channelCount + row.examItemCount;
      const byTotal = totalOf(b) - totalOf(a);
      return byTotal !== 0 ? byTotal : a.tag.localeCompare(b.tag, 'ru');
    });
}
