// Выборки тика «Занятие скоро» (LessonReminderService, ADR-0162): занятия окна
// вместе с названиями активных классов и уже записанные строки ленты. Отдельным
// файлом, чтобы сервис не рос за границу храповика размера, а запросы были
// видны целиком: по запросу на шаг, а не на занятие или человека в цикле.
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { ClassRecord } from '../classes/class.schema';
import type { NotificationRecord } from '../notifications/notification.schema';
import type { LessonRecord } from './lesson.schema';
import { reminderKey, type PlanLesson } from './lesson-reminder-plan';

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
    .lean<{ _id: Types.ObjectId; classId: Types.ObjectId; startsAt: Date }[]>();
  if (lessons.length === 0) return [];

  const classes = await classModel
    .find({ _id: { $in: lessons.map((l) => l.classId) }, active: true }, { title: 1 })
    .lean<{ _id: Types.ObjectId; title: string }[]>();
  const titles = new Map(classes.map((c) => [c._id.toString(), c.title]));
  return lessons.flatMap((lesson) => {
    const classId = lesson.classId.toString();
    const title = titles.get(classId);
    if (title === undefined) return [];
    return [{ id: lesson._id.toString(), classId, title, startsAt: lesson.startsAt }];
  });
}

/** Пары «человек × занятие», по которым строка ленты уже есть, — одним
 * запросом по индексу (userId, kind, lessonId). Строку могли написать прошлый
 * тик, соседний инстанс или прежний код — во всех случаях «уже напомнили». */
export async function existingReminderKeys(
  notificationModel: Model<NotificationRecord>,
  userIds: readonly string[],
  lessonIds: readonly string[],
): Promise<Set<string>> {
  const rows = await notificationModel
    .find(
      {
        userId: { $in: [...userIds] },
        kind: 'lesson_soon',
        lessonId: { $in: [...lessonIds] },
      },
      { userId: 1, lessonId: 1 },
    )
    .lean<{ userId: string; lessonId: string }[]>();
  return new Set(rows.map((row) => reminderKey(row.userId, row.lessonId)));
}
