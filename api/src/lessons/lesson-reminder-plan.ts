// Кому и о каком занятии пора напомнить прямо сейчас (ADR-0162, п. 3). Чистая
// функция, без Mongo: тик читает занятия, людей и уже записанные строки ленты,
// здесь только решает. «Пора» у каждого человека своё — он выбирает «за сколько
// минут» сам, а если не выбирал, берётся школьное значение
// (`effectiveReminderMinutes`), поэтому «это занятие уже разобрано» теперь
// свойство пары «человек × занятие», а не занятия.
import { DateTime } from 'luxon';
import { effectiveReminderMinutes, isLessonInScope } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';

export interface PlannedReminder {
  lessonId: string;
  lessonTitle: string;
  userId: string;
}

export interface ReminderPlanInput {
  lessons: readonly PlanLesson[];
  recipients: readonly { id: string }[];
  /** Выбор людей; у кого записи нет — «обо всех» и «как в школе». */
  prefs: ReadonlyMap<string, LessonPrefs>;
  /** Пары, по которым строка ленты уже есть (`lessonRowKey`). */
  existing: ReadonlySet<string>;
  schoolMinutes: number;
  now: DateTime;
}

/** За сколько минут самый «ранний» из людей хочет напоминание: окно выборки
 * занятий из базы должно накрывать его, иначе занятие не попадёт в кандидаты
 * вовсе. */
export function maxLeadMinutes(
  recipients: readonly { id: string }[],
  prefs: ReadonlyMap<string, LessonPrefs>,
  schoolMinutes: number,
): number {
  return recipients.reduce(
    (max, { id }) =>
      Math.max(
        max,
        effectiveReminderMinutes(prefs.get(id)?.reminderMinutes, schoolMinutes),
      ),
    0,
  );
}

/** Минуты до начала по настоящим часам: разница моментов, а не стрелок в
 * поясе школы — ночь перевода часов в Asia/Jerusalem не сдвигает напоминание
 * на час. */
function minutesUntil(startsAt: Date, now: DateTime): number {
  return DateTime.fromJSDate(startsAt, { zone: 'utc' }).diff(now, 'minutes').minutes;
}

/** Пары «человек × занятие», которым пора. Занятие уже началось (`≤ 0` минут) —
 * не напоминаем; ровно `lead` минут до начала — уже пора. Порядок — занятия как
 * пришли, внутри занятия — получатели как пришли. */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const { lessons, recipients, prefs, existing, schoolMinutes, now } = input;
  const planned: PlannedReminder[] = [];
  for (const lesson of lessons) {
    const minutes = minutesUntil(lesson.startsAt, now);
    if (minutes <= 0) continue;
    for (const { id: userId } of recipients) {
      const own = prefs.get(userId);
      if (own && !isLessonInScope(own.scope, lesson.classId)) continue;
      if (minutes > effectiveReminderMinutes(own?.reminderMinutes, schoolMinutes))
        continue;
      if (existing.has(lessonRowKey(userId, lesson.id))) continue;
      planned.push({ lessonId: lesson.id, lessonTitle: lesson.title, userId });
    }
  }
  return planned;
}
