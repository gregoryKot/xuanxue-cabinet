// Правило расписания → конкретные моменты начала в UTC (ADR-0003). Без
// Mongo, без DI — юнит-тест без базы (CLAUDE.md «Тесты»). «Сейчас» и границы
// окна — всегда параметром, не Date.now().
import { DateTime } from 'luxon';
import type { Types } from 'mongoose';
import { RULE_TIME_RE, type Weekday } from '@xuanxue/shared';
import type { LeanScheduleRule } from '../classes/class.schema';

// Школа хранит день недели как 0 = воскресенье … 6 = суббота (ADR-0003,
// docs/PLAN.md §1 — неделя начинается с воскресенья); Luxon.DateTime#weekday
// — ISO: 1 = понедельник … 7 = воскресенье. Перевод явный, а не формулой без
// имени: 0 (Вс) уходит в 7, 1..6 (Пн..Сб) остаются как есть.
function toLuxonWeekday(weekday: Weekday): number {
  return weekday === 0 ? 7 : weekday;
}

// `RULE_TIME_RE` уже гарантирует формат "HH:mm" (схема Mongoose проверяет
// его же при записи — это защита в глубину); минуты берём срезом по
// фиксированной позиции, а не `split(':')[1]` — под `noUncheckedIndexedAccess`
// результат индексации массива был бы `string | undefined`.
function parseRuleTime(time: string): { hour: number; minute: number } {
  const match = RULE_TIME_RE.exec(time);
  const hourGroup = match?.[1];
  if (hourGroup === undefined) {
    throw new Error(`Неверный формат времени правила расписания: "${time}"`);
  }
  return { hour: Number(hourGroup), minute: Number(time.slice(3)) };
}

/**
 * Моменты начала по правилу в окне `[from, to)` — в UTC. Перебор дней в
 * поясе `tz`: `from.setZone(tz).startOf('day')` до `to`, для дня с нужным
 * `weekday` — `DateTime.fromObject({ ...дата, hour, minute }, { zone: tz })`
 * и `toUTC()`. Несуществующее локальное время (час перехода вперёд) Luxon
 * сдвигает сам — тест на DST фиксирует это поведение, не оборачивает его.
 */
export function planOccurrences(
  rule: Pick<LeanScheduleRule, 'weekday' | 'time'>,
  tz: string,
  from: DateTime,
  to: DateTime,
): DateTime[] {
  const { hour, minute } = parseRuleTime(rule.time);
  const targetWeekday = toLuxonWeekday(rule.weekday);
  const occurrences: DateTime[] = [];

  let cursor = from.setZone(tz).startOf('day');
  while (cursor < to) {
    if (cursor.weekday === targetWeekday) {
      const localMoment = DateTime.fromObject(
        { year: cursor.year, month: cursor.month, day: cursor.day, hour, minute },
        { zone: tz },
      );
      const utcMoment = localMoment.toUTC();
      if (utcMoment >= from && utcMoment < to) occurrences.push(utcMoment);
    }
    cursor = cursor.plus({ days: 1 });
  }
  return occurrences;
}

/** Ожидаемое занятие правила на окне: момент начала, длительность и правило,
 * которое его породило (ключ карты в `expectedOccurrences` — миллисекунды
 * начала, не строка ISO: сравнение с `lesson.plannedAt.getTime()` без
 * форматирования и без `new Date(строка)`, запрещённого CLAUDE.md «Время»). */
export interface ExpectedOccurrence {
  ruleId: Types.ObjectId;
  durationMin: number;
  plannedAt: DateTime;
}

/** Ожидаемые занятия всех правил класса на окне `[from, to)`, по одному на
 * момент начала — используется и для diff со текущими занятиями
 * (`reconcileClass`), и для переноса на новое время того же правила
 * (`occurrenceAtSameLocalDate`). */
export function expectedOccurrences(
  rules: readonly LeanScheduleRule[],
  tz: string,
  from: DateTime,
  to: DateTime,
): Map<number, ExpectedOccurrence> {
  const result = new Map<number, ExpectedOccurrence>();
  for (const rule of rules) {
    for (const plannedAt of planOccurrences(rule, tz, from, to)) {
      result.set(plannedAt.toMillis(), {
        ruleId: rule._id,
        durationMin: rule.durationMin,
        plannedAt,
      });
    }
  }
  return result;
}

/** Кандидат на перенос занятия при смене времени правила: та же локальная
 * дата, что была у `reference` (старый `plannedAt`), но час/минута — из
 * текущего правила. Меняет только время суток, не день — если у правила
 * сменился ещё и `weekday`, кандидат не совпадёт ни с одним ожидаемым
 * моментом, и `reconcileClass` откажется от переноса — правило переехало на
 * другой день, это уже не «то же занятие, другое время». */
export function occurrenceAtSameLocalDate(
  rule: Pick<LeanScheduleRule, 'time'>,
  tz: string,
  reference: DateTime,
): DateTime {
  const { hour, minute } = parseRuleTime(rule.time);
  return reference.setZone(tz).set({ hour, minute, second: 0, millisecond: 0 }).toUTC();
}
