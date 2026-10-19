// Напоминание «Занятие скоро» идёт только по выбору напоминаний (`reminderClassIds`,
// `reminderLessonIds`, ADR-0185), а не по старому фильтру «о каких занятиях». Чтобы
// человек, который сам отметил занятия в режиме «только о выбранных», не остался без
// напоминаний, его отметки переходят в выбор напоминаний.
//
// Правило. Документ с `lessonScopeMode: 'selected'` и непустым `lessonClassIds`:
// каждое занятие из `lessonClassIds` добавляется в `reminderClassIds` (объединение
// множеств, порядок — как в `lessonClassIds`, повторов нет). Режим «все» и документ без
// режима не трогаются: фильтр «все» никогда не разворачивается в подписки на
// напоминания. В выборе напоминаний не больше `LESSON_SCOPE_CLASS_IDS_MAX` занятий
// (как у записи через синхронизацию): уже выбранные остаются, новые добавляются, пока
// есть место. `reminderRevision` растёт на 1 только там, где массив стал длиннее: клиент
// по ревизии отличает свежий снимок от устаревшего, а неизменившемуся выбору новая
// ревизия не нужна.
//
// Старый фильтр, `lessonClassIds` и `lessonReminderMinutes` остаются как есть: фильтр
// по-прежнему управляет отменами, записями и новыми материалами. Идемпотентна: второй
// запуск ничего не добавляет и ревизию не двигает. Совместима со старым кодом: он поля
// напоминаний только читает. Один `updateMany` с конвейером — расчёт на стороне базы, а
// не круг запросов на каждого человека.
import type { mongo } from 'mongoose';
import { LESSON_SCOPE_CLASS_IDS_MAX } from '@xuanxue/shared';

type Db = mongo.Db;

const PREFS = 'notification_prefs';
// Временное поле конвейера: в документе не остаётся (последняя стадия его убирает).
const MERGED = 'mergedReminderClassIds';

const CURRENT_IDS = { $ifNull: ['$reminderClassIds', []] };

// Добавляет по одному занятию из старого выбора, пока оно не выбрано и есть место.
const MERGE_IDS = {
  $reduce: {
    input: '$lessonClassIds',
    initialValue: CURRENT_IDS,
    in: {
      $cond: [
        {
          $or: [
            { $in: ['$$this', '$$value'] },
            { $gte: [{ $size: '$$value' }, LESSON_SCOPE_CLASS_IDS_MAX] },
          ],
        },
        '$$value',
        { $concatArrays: ['$$value', ['$$this']] },
      ],
    },
  },
};

const GREW = { $gt: [{ $size: `$${MERGED}` }, { $size: CURRENT_IDS }] };

const SEED_PIPELINE = [
  { $set: { [MERGED]: MERGE_IDS } },
  {
    $set: {
      // Нет поля и ничего не добавилось — `$reminderRevision` остаётся отсутствующим,
      // а не становится нулём.
      reminderRevision: {
        $cond: [
          GREW,
          { $add: [{ $ifNull: ['$reminderRevision', 0] }, 1] },
          '$reminderRevision',
        ],
      },
      reminderClassIds: `$${MERGED}`,
    },
  },
  { $unset: MERGED },
];

export const reminderChoicesFromSelectedScope = {
  id: '0025-reminder-choices-from-selected-scope',
  async up(db: Db): Promise<string[]> {
    const { modifiedCount } = await db
      .collection(PREFS)
      .updateMany(
        { lessonScopeMode: 'selected', 'lessonClassIds.0': { $exists: true } },
        SEED_PIPELINE,
      );
    if (modifiedCount === 0) return [];
    return [`выбранные занятия перенесены в напоминания у ${modifiedCount} чел.`];
  },
};
