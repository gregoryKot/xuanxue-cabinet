// Режим выборки публичного расписания (ADR-0170, контракт Workshop). Чистая
// логика без Mongo и DI: какой из двух режимов запрошен и допустимо ли окно.
import type { DateTime } from 'luxon';
import {
  PUBLIC_LESSONS_LIMIT_DEFAULT,
  PUBLIC_LESSONS_WINDOW_MAX_WEEKS,
  type ListPublicLessonsQuery,
} from '@xuanxue/shared';
import { assertWindow } from '../common/date-window';
import { InvalidInputError } from '../common/errors';
import { parseUtcIso } from './lesson-dates';

export type PublicLessonsSelection =
  { mode: 'count'; limit: number } | { mode: 'window'; from: DateTime; to: DateTime };

const HALF_WINDOW_MESSAGE =
  'Укажите оба поля периода — «from» и «to», либо ни одного. Одна граница не задаёт выборку.';
const LIMIT_WITH_WINDOW_MESSAGE =
  'Укажите либо limit, либо период from/to. Вместе они не работают: у периода нет предела по числу занятий.';
const WINDOW_TOO_WIDE_SUFFIX =
  'для более длинного расписания запросите несколько периодов.';

/**
 * Без `from`/`to` — «ближайшие» (с `limit`, по умолчанию 10); с обоими —
 * полное окно `from <= startsAt < to` без лимита. Остальное — 400: половина
 * окна, окно вместе с `limit`, окно шире 28 суток UTC или с `to <= from`
 * (ровно 28 суток допустимо, `assertWindow`). Смещение у `from`/`to`
 * обязательно (`parseUtcIso`), иначе «19:00» молча стало бы UTC.
 */
export function resolvePublicLessonsWindow(
  query: ListPublicLessonsQuery,
): PublicLessonsSelection {
  const { from, to, limit } = query;
  if (from === undefined && to === undefined) {
    return { mode: 'count', limit: limit ?? PUBLIC_LESSONS_LIMIT_DEFAULT };
  }
  if (from === undefined || to === undefined) {
    throw new InvalidInputError(HALF_WINDOW_MESSAGE);
  }
  if (limit !== undefined) {
    throw new InvalidInputError(LIMIT_WITH_WINDOW_MESSAGE);
  }
  const parsedFrom = parseUtcIso(from, 'from');
  const parsedTo = parseUtcIso(to, 'to');
  assertWindow(
    parsedFrom,
    parsedTo,
    PUBLIC_LESSONS_WINDOW_MAX_WEEKS,
    WINDOW_TOO_WIDE_SUFFIX,
  );
  return { mode: 'window', from: parsedFrom, to: parsedTo };
}
