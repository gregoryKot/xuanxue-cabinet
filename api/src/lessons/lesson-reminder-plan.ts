// Кому и о каком занятии пора напомнить прямо сейчас (ADR-0162, п. 3; ADR-0185).
// Чистая функция, без Mongo: тик читает занятия, людей и уже записанные строки
// ленты, здесь только решает. Два вопроса: «о нём ли человек просил» — по выбору
// напоминаний (классы и отдельные занятия), «пора ли» — по его «за сколько
// минут» (свой выбор или школьное значение, `effectiveReminderMinutes`). Выбор
// «о каких занятиях» (`scope`) напоминание не трогает: он для отмены, записи и
// материалов. «Уже разобрано» — свойство пары «человек × занятие», а не занятия.
import { DateTime, type Duration } from 'luxon';
import { effectiveReminderMinutes } from '@xuanxue/shared';
import type { LessonPrefs } from '../notifications/lesson-scope.service';
import { lessonRowKey, type PlanLesson } from './lesson-notice-queries';

/** Допуск тика для нулевого «за сколько»: напомнить в момент начала можно только
 * на первом тике после него, и тик бывает раз в минуту. Позже — не напоминаем:
 * пропущенное окно не догоняется. Окно выборки занятий (lesson-reminder-queries)
 * берёт ту же величину. */
export const ZERO_LEAD_TOLERANCE_SECONDS = 60;

export interface PlannedReminder {
  lessonId: string;
  lessonTitle: string;
  userId: string;
}

export interface ReminderPlanInput {
  lessons: readonly PlanLesson[];
  recipients: readonly { id: string }[];
  /** Выбор людей; у кого записи нет — ни одного занятия для напоминания. */
  prefs: ReadonlyMap<string, LessonPrefs>;
  /** Пары, по которым строка ленты уже есть (`lessonRowKey`). */
  existing: ReadonlySet<string>;
  schoolMinutes: number;
  now: DateTime;
}

/** Выбрал ли человек хоть что-то для напоминаний: без выбора ему напоминать не о
 * чем, и в окно выборки занятий он не входит. */
function hasReminderChoice(own: LessonPrefs | undefined): boolean {
  return Boolean(
    own && (own.reminderClassIds.size > 0 || own.reminderLessonIds.size > 0),
  );
}

/** Получатели, у которых есть хоть один выбор для напоминаний. */
export function withReminderChoices<T extends { id: string }>(
  recipients: readonly T[],
  prefs: ReadonlyMap<string, LessonPrefs>,
): T[] {
  return recipients.filter(({ id }) => hasReminderChoice(prefs.get(id)));
}

/** Просил ли человек напоминать об этом занятии: оно само или его класс. Оба
 * выбора сразу — всё равно одно занятие, дубль снимет уникальная строка ленты. */
function isChosenForReminder(own: LessonPrefs | undefined, lesson: PlanLesson): boolean {
  if (!own) return false;
  return own.reminderLessonIds.has(lesson.id) || own.reminderClassIds.has(lesson.classId);
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

/** Сколько осталось до начала по настоящим часам: разница моментов, а не стрелок
 * в поясе школы — ночь перевода часов в Asia/Jerusalem не сдвигает напоминание
 * на час. Отрицательная — занятие уже началось. */
function untilStart(startsAt: Date, now: DateTime): Duration {
  return DateTime.fromJSDate(startsAt, { zone: 'utc' }).diff(now);
}

/** Пора ли напоминать. Положительное `leadMinutes`: занятие ещё не началось и
 * до него не больше `leadMinutes` (ровно `leadMinutes` — уже пора, ровно начало —
 * уже поздно). Ноль: занятие началось не раньше `ZERO_LEAD_TOLERANCE_SECONDS`
 * назад (ровно начало и ровно допуск — пора). До начала по нулю не напоминаем
 * никогда. */
export function isReminderDue(
  untilStartDuration: Duration,
  leadMinutes: number,
): boolean {
  if (leadMinutes === 0) {
    const seconds = untilStartDuration.as('seconds');
    return seconds <= 0 && seconds >= -ZERO_LEAD_TOLERANCE_SECONDS;
  }
  const minutes = untilStartDuration.as('minutes');
  return minutes > 0 && minutes <= leadMinutes;
}

/** Пары «человек × занятие», которым пора. Порядок — занятия как пришли, внутри
 * занятия — получатели как пришли. */
export function planReminders(input: ReminderPlanInput): PlannedReminder[] {
  const { lessons, recipients, prefs, existing, schoolMinutes, now } = input;
  const planned: PlannedReminder[] = [];
  for (const lesson of lessons) {
    const remaining = untilStart(lesson.startsAt, now);
    for (const { id: userId } of recipients) {
      const own = prefs.get(userId);
      if (!isChosenForReminder(own, lesson)) continue;
      const lead = effectiveReminderMinutes(own?.reminderMinutes, schoolMinutes);
      if (!isReminderDue(remaining, lead)) continue;
      if (existing.has(lessonRowKey(userId, lesson.id))) continue;
      planned.push({ lessonId: lesson.id, lessonTitle: lesson.title, userId });
    }
  }
  return planned;
}
