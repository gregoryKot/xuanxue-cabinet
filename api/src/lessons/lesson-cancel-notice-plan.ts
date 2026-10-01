// Кому и о каком отменённом занятии написать (ADR-0162). Чистая функция, без
// Mongo: тик читает занятия, получателей и уже записанные строки ленты, здесь
// только решает. В отличие от напоминания, времени у отмены нет — сообщать надо
// сразу, а не «за столько-то минут», поэтому решение короткое: занятие входит в
// «о каких занятиях» человека, и строки о нём у него ещё нет.
import { isLessonInScope } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';

export interface PlannedCancelNotice {
  userId: string;
  lessonId: string;
  lessonTitle: string;
  lessonStartsAt: Date;
}

export interface CancelNoticePlanInput {
  lessons: readonly PlanLesson[];
  recipients: readonly { id: string }[];
  /** Выбор людей; у кого записи нет — «обо всех занятиях». */
  prefs: ReadonlyMap<string, LessonPrefs>;
  /** Пары, по которым строка ленты уже есть (`lessonRowKey`). */
  existing: ReadonlySet<string>;
}

/** Пары «человек × занятие», которым надо сообщить. Порядок — занятия как
 * пришли, внутри занятия — получатели как пришли. */
export function planCancelNotices(input: CancelNoticePlanInput): PlannedCancelNotice[] {
  const { lessons, recipients, prefs, existing } = input;
  const planned: PlannedCancelNotice[] = [];
  for (const lesson of lessons) {
    for (const { id: userId } of recipients) {
      const own = prefs.get(userId);
      if (own && !isLessonInScope(own.scope, lesson.classId)) continue;
      if (existing.has(lessonRowKey(userId, lesson.id))) continue;
      planned.push({
        userId,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lessonStartsAt: lesson.startsAt,
      });
    }
  }
  return planned;
}
