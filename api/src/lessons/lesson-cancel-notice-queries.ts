// Выборка тика «Занятие отменено» (LessonCancelNoticeService, ADR-0162):
// отменённые будущие занятия за последние сутки у активных классов. Отдельным
// файлом по той же причине, что lesson-reminder-queries.ts: запрос виден целиком
// и сервис не растёт за границу храповика размера.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from './lesson.schema';
import {
  withActiveClassTitles,
  type LeanNoticeLesson,
  type PlanLesson,
} from './lesson-notice-queries';

/** Вид строки ленты, которую пишет этот шаг тика. */
export const LESSON_CANCELLED_KIND = 'lesson_cancelled' as const;

/** Сколько часов после отмены шаг тика пробует сообщить: отмена, которую не
 * удалось доставить сразу (сбой записи, ученик включил вид позже), догоняется
 * следующими тиками. Дальше — хватит: занятие давно в расписании как
 * отменённое, а перечитывать его каждую минуту до самой даты незачем. */
export const CANCEL_NOTICE_WINDOW_HOURS = 24;

// Пачка не «20», как у напоминания: разобранные отмены из выборки не
// выпадают (отметки на занятии нет, «уже сообщили» — строки ленты), и когда
// учитель одним махом отменяет недели занятий (праздники, отпуск), первые 20
// уже объявленных держали бы место следующим до конца окна. LIST_LIMIT_MAX с
// запасом накрывает горизонт планировщика — четыре недели вперёд (PLAN §4).
const CANCEL_NOTICE_BATCH_LIMIT = LIST_LIMIT_MAX;

/** Занятия `cancelled`, отменённые не раньше чем `CANCEL_NOTICE_WINDOW_HOURS`
 * назад и ещё не начавшиеся, у активных классов; ближайшие впереди. Занятие,
 * отменённое до появления `cancelledAt`, в выборку не попадает — его не
 * объявляют задним числом. Начавшееся занятие тоже не объявляют: отмена после
 * начала ученику уже ничего не скажет. */
export async function findRecentlyCancelledLessons(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: DateTime,
): Promise<PlanLesson[]> {
  const lessons = await lessonModel
    .find(
      {
        status: 'cancelled',
        cancelledAt: {
          $gte: now.minus({ hours: CANCEL_NOTICE_WINDOW_HOURS }).toJSDate(),
        },
        startsAt: { $gt: now.toJSDate() },
      },
      { classId: 1, startsAt: 1 },
    )
    .sort({ startsAt: 1 })
    .limit(CANCEL_NOTICE_BATCH_LIMIT)
    .lean<LeanNoticeLesson[]>();
  return withActiveClassTitles(classModel, lessons);
}
