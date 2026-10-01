// Выборки, общие для двух шагов тика о занятии: «Занятие скоро»
// (LessonReminderService, ADR-0135) и «Занятие отменено»
// (LessonCancelNoticeService, ADR-0162). Оба берут занятия у активных классов и
// ставят «уже сообщили» строкой ленты с уникальным индексом (userId, kind,
// lessonId), поэтому название класса и проверка «строка уже есть» у них одни, а
// не две похожих копии (CLAUDE.md «Одна механика — один компонент»).
import type { Model, Types } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';
import type { NotificationRecord } from '../notifications/notification.schema';

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
