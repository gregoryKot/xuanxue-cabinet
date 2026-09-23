// Срок сдачи диалога «Собрать экзамен» (ТЗ 4б.4, docs/PLAN.md §12,
// ADR-0125) — учитель выбирает кнопкой один из осмысленных сроков, не
// печатает дату сообщением (ADR-0127: свободный ввод даты в чате даёт
// слишком много кривых форматов ради поля, у которого и так есть точный
// ввод в кабинете). Конец выбранного дня по часам школы (SCHOOL_TZ), не
// текущий час — ученик видит весь день, а не случайный момент нажатия
// кнопки учителем. Дата считается от `now` хендлера (CLAUDE.md
// «Детерминизм»), не от `Date.now()`; только Luxon — `new Date(строка)` и
// арифметика на миллисекундах в бизнес-логике запрещены eslint.
import type { DateTime } from 'luxon';
import { SCHOOL_TZ } from '@xuanxue/shared';

const DUE_AT_OFFSETS: Partial<Record<string, { weeks?: number; months?: number }>> = {
  '1w': { weeks: 1 },
  '2w': { weeks: 2 },
  '1m': { months: 1 },
};

/** `undefined` — «без срока» (id 'none' или незнакомый id, ровно как
 * `TIME_LIMIT_MINUTES` у лимита времени, new-exam-callback.ts). */
export function resolveNewExamDueAt(id: string, now: DateTime): string | undefined {
  const offset = DUE_AT_OFFSETS[id];
  if (!offset) return undefined;
  const iso = now.setZone(SCHOOL_TZ).plus(offset).endOf('day').toUTC().toISO();
  if (iso === null) {
    throw new Error(`resolveNewExamDueAt: невалидная дата для пресета «${id}»`);
  }
  return iso;
}
