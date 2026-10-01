// Выборка тика «Запись занятия» (RecordingReadyNoticeService, ADR-0162): занятия,
// которым запись добавили за последние сутки. Сам запрос, окно и пачка —
// lesson-notice-queries.ts, общие с «Занятием отменено».
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
export const RECORDING_READY_KIND = 'recording_ready' as const;

/** Занятия, у которых первая запись появилась в окне повторов
 * (`LESSON_NOTICE_WINDOW_HOURS`), не отменённые, у активных классов; сначала
 * те, кому окно кончится раньше. Начавшиеся: в «Записях занятий» ученика
 * (`GET /me/lessons/archive`) занятие появляется после начала, и строка ленты
 * «есть запись», за которой ученик ничего не найдёт, хуже её отсутствия.
 * Занятие, у которого записи появились до `recordingReadyAt`, в выборку не
 * попадает — старые записи задним числом не объявляют. */
export function findRecentlyRecordedLessons(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: DateTime,
): Promise<PlanLesson[]> {
  return findNoticeLessons(lessonModel, classModel, {
    filter: {
      status: { $ne: 'cancelled' },
      recordingReadyAt: { $gte: noticeWindowStart(now) },
      startsAt: { $lte: now.toJSDate() },
    },
    sort: { recordingReadyAt: 1 },
  });
}
