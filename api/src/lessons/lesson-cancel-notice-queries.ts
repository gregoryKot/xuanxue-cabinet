// Выборка тика «Занятие отменено» (LessonCancelNoticeService, ADR-0162):
// отменённые будущие занятия за последние сутки у активных классов. Сам запрос,
// окно и пачка — lesson-notice-queries.ts, общие с «Записью занятия».
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from './lesson.schema';
import {
  findNoticeLessons,
  noticeWindowStart,
  type PlanLesson,
} from './lesson-notice-queries';

/** Вид строки ленты, которую пишет этот шаг тика. */
export const LESSON_CANCELLED_KIND = 'lesson_cancelled' as const;

/** Занятия `cancelled`, отменённые в окне повторов (`LESSON_NOTICE_WINDOW_HOURS`)
 * и ещё не начавшиеся, у активных классов; ближайшие впереди. Занятие,
 * отменённое до появления `cancelledAt`, в выборку не попадает — его не
 * объявляют задним числом. Начавшееся занятие тоже не объявляют: отмена после
 * начала ученику уже ничего не скажет. */
export function findRecentlyCancelledLessons(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: DateTime,
): Promise<PlanLesson[]> {
  return findNoticeLessons(lessonModel, classModel, {
    filter: {
      status: 'cancelled',
      cancelledAt: { $gte: noticeWindowStart(now) },
      startsAt: { $gt: now.toJSDate() },
    },
    sort: { startsAt: 1 },
  });
}
