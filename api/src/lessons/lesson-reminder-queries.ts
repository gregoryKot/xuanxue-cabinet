// Выборка тика «Занятие скоро» (LessonReminderService, ADR-0162): занятия окна
// вместе с названиями активных классов. Отдельным файлом, чтобы сервис не рос
// за границу храповика размера, а запрос был виден целиком: один на шаг, а не
// на занятие или человека в цикле. Название класса и уже записанные строки
// ленты — в lesson-notice-queries.ts, они общие с шагом «Занятие отменено».
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from './lesson.schema';
import {
  withActiveClassTitles,
  type LeanNoticeLesson,
  type PlanLesson,
} from './lesson-notice-queries';

/** Вид строки ленты, которую пишет этот шаг тика. */
export const LESSON_SOON_KIND = 'lesson_soon' as const;

// Кандидатов на тик — не «дай всё» (CLAUDE.md «API»), тот же порядок, что
// PROMPT_BATCH_LIMIT у RecordingPromptService: следующий тик доберёт остаток.
// Разобранные занятия из выборки не выпадают (отметки на занятии больше нет),
// но в окне их единицы, а сортировка по началу держит ближайшие впереди.
const LESSON_REMINDER_BATCH_LIMIT = 20;

/** Занятия `scheduled`, которые начнутся в `(now, now + maxLead]`, у активных
 * классов. Окно берёт самого раннего из людей; кому из них пора именно сейчас,
 * решает `planReminders`. Класс выключен или удалён — напоминать не о чем. */
export async function findUpcomingLessons(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: DateTime,
  maxLead: number,
): Promise<PlanLesson[]> {
  const lessons = await lessonModel
    .find(
      {
        status: 'scheduled',
        startsAt: {
          $gt: now.toJSDate(),
          $lte: now.plus({ minutes: maxLead }).toJSDate(),
        },
      },
      { classId: 1, startsAt: 1 },
    )
    .sort({ startsAt: 1 })
    .limit(LESSON_REMINDER_BATCH_LIMIT)
    .lean<LeanNoticeLesson[]>();
  return withActiveClassTitles(classModel, lessons);
}
