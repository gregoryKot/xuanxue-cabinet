// Выборки, общие для шагов тика о занятии: «Занятие скоро»
// (LessonReminderService, ADR-0135), «Занятие отменено»
// (LessonCancelNoticeService) и «Запись занятия» (RecordingReadyNoticeService,
// оба ADR-0162). Все берут занятия у активных классов и ставят «уже сообщили»
// строкой ленты с уникальным индексом (userId, kind, lessonId), поэтому
// название класса и проверка «строка уже есть» у них одни, а не три похожих
// копии (CLAUDE.md «Одна механика — один компонент»).
import type { DateTime } from 'luxon';
import type { QueryFilter, Model, SortOrder, Types } from 'mongoose';
import { LIST_LIMIT_MAX, type NotificationKind } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';
import type { NotificationRecord } from '../notifications/notification.schema';
import type { LessonRecord } from './lesson.schema';

/** Сколько часов после события (отмены, добавленной записи) шаг тика пробует
 * сообщить о нём: то, что не удалось доставить сразу (сбой записи, человек
 * включил вид позже), догоняется следующими тиками. Дальше — хватит: занятие
 * давно в расписании, а перечитывать его каждую минуту незачем. Одно число на
 * оба шага: «сутки повторов» — свойство тика, а не вида. */
export const LESSON_NOTICE_WINDOW_HOURS = 24;

/** Начало окна повторов: события не раньше этого момента ещё объявляются. */
export function noticeWindowStart(now: DateTime): Date {
  return now.minus({ hours: LESSON_NOTICE_WINDOW_HOURS }).toJSDate();
}

// Пачка не «20», как у напоминания: разобранные занятия из выборки не
// выпадают (отметки на занятии нет, «уже сообщили» — строки ленты), и когда
// учитель одним махом отменяет недели занятий (праздники, отпуск), первые 20
// уже объявленных держали бы место следующим до конца окна. LIST_LIMIT_MAX с
// запасом накрывает горизонт планировщика — четыре недели вперёд (PLAN §4).
const LESSON_NOTICE_BATCH_LIMIT = LIST_LIMIT_MAX;

/** Занятие, о котором шаг решает, кого известить. */
export interface PlanLesson {
  id: string;
  classId: string;
  /** Название класса: снимок для строки ленты (`lessonTitle`). */
  title: string;
  startsAt: Date;
}

/** Занятие как оно лежит в базе — то, что шаги выбирают первым запросом. */
export interface LeanNoticeLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  startsAt: Date;
}

/** Ключ пары «человек × занятие» для множества уже записанных строк. */
export function lessonRowKey(userId: string, lessonId: string): string {
  return `${userId}:${lessonId}`;
}

/** Занятия с названием класса одним запросом по классам, не по занятию.
 * Класс выключен или удалён — сообщать не о чем, занятие из результата
 * выпадает; порядок остальных — как пришли. */
export async function withActiveClassTitles(
  classModel: Model<ClassRecord>,
  lessons: readonly LeanNoticeLesson[],
): Promise<PlanLesson[]> {
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

/** Занятия, о которых шагу есть что сообщить: `filter` — что именно случилось
 * (отмена, запись), `sort` — кто идёт первым, если пачка не поместилась. Занятие
 * с выключенным или удалённым классом из результата выпадает (`withActiveClassTitles`). */
export async function findNoticeLessons(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  query: { filter: QueryFilter<LessonRecord>; sort: Record<string, SortOrder> },
): Promise<PlanLesson[]> {
  const lessons = await lessonModel
    .find(query.filter, { classId: 1, startsAt: 1 })
    .sort(query.sort)
    .limit(LESSON_NOTICE_BATCH_LIMIT)
    .lean<LeanNoticeLesson[]>();
  return withActiveClassTitles(classModel, lessons);
}

/** Пары «человек × занятие», по которым строка этого вида уже есть, — одним
 * запросом по индексу (userId, kind, lessonId). Строку могли написать прошлый
 * тик, соседний инстанс или прежний код — во всех случаях «уже сообщили».
 * Вид в запросе обязателен: у одного занятия строки `lesson_soon` и
 * `lesson_cancelled` живут рядом и друг друга не отменяют. */
export async function existingLessonRowKeys(
  notificationModel: Model<NotificationRecord>,
  kind: NotificationKind,
  userIds: readonly string[],
  lessonIds: readonly string[],
): Promise<Set<string>> {
  const rows = await notificationModel
    .find(
      { userId: { $in: [...userIds] }, kind, lessonId: { $in: [...lessonIds] } },
      { userId: 1, lessonId: 1 },
    )
    .lean<{ userId: string; lessonId: string }[]>();
  return new Set(rows.map((row) => lessonRowKey(row.userId, row.lessonId)));
}
