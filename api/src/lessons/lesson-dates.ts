// Разбор и проверка дат `/lessons` — чистая логика, юнит-тест без Mongo
// (CLAUDE.md «Тесты»). Только Luxon: `new Date(строка)` в бизнес-логике
// запрещён eslint (ADR-0003).
import { DateTime } from 'luxon';
import { PLANNING_HORIZON_WEEKS } from '@xuanxue/shared';
import { assertWindow } from '../common/date-window';
import { InvalidInputError } from '../common/errors';

// `@IsISO8601({ strict: true })` в DTO пропускает и дату без времени, и время
// без смещения — это всё ещё валидный ISO 8601. Строка без смещения молча
// считалась бы UTC (Luxon интерпретирует «голые» часы в зоне из `zone`), и
// «19:00 по Израилю» ушло бы в БД как 19:00 UTC — на самом деле 22:00 (ADR-0003).
// Явный хвост Z/±HH:mm/±HHMM обязателен до разбора.
const ISO_OFFSET_SUFFIX = /(?:Z|[+-]\d{2}:?\d{2})$/;

/** ISO 8601 со смещением из тела/query запроса → `DateTime` в UTC. `fieldLabel`
 * — имя поля в сообщении об ошибке (`startsAt`, `from`, `to`), чтобы учитель
 * понимал, какое именно значение поправить. */
export function parseUtcIso(value: string, fieldLabel: string): DateTime {
  if (!ISO_OFFSET_SUFFIX.test(value)) {
    throw new InvalidInputError(
      `Поле «${fieldLabel}»: укажите время со смещением, например 2026-09-10T16:00:00Z.`,
    );
  }
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid) {
    throw new InvalidInputError(
      `Поле «${fieldLabel}»: дата в неверном формате. Нужен ISO 8601, например 2026-09-10T16:00:00Z.`,
    );
  }
  return parsed;
}

/** Окно списка `GET /lessons` не шире горизонта планировщика — тот же
 * PLANNING_HORIZON_WEEKS, что и у генерации занятий (shared/src/domain.ts):
 * запрашивать больше нет смысла, дальше расписание ещё не построено. Сама
 * проверка окна — общая (`assertWindow`, common/date-window.ts): журнал
 * рассылок (`broadcast-journal.ts`) сверяет то же самое, только со своим
 * пределом и причиной. */
export function assertListWindow(from: DateTime, to: DateTime): void {
  assertWindow(
    from,
    to,
    PLANNING_HORIZON_WEEKS,
    'дальше расписание ещё не построено. Сузьте окно.',
  );
}

// Одно место для правила ADR-0074 «окно обязательно, если нет тега» —
// вызывается только из findLessonsList (lessons.queries.ts), в DTO
// (ListLessonsDto) требования порознь не дублируются.
const WINDOW_OR_TAG_MESSAGE =
  'Укажите оба поля периода — «Начало периода» и «Конец периода». Без тега ' +
  'это обязательно; с тегом оба поля можно опустить.';

/**
 * Окно `from..to` списка `/lessons`: обязательно само по себе, необязательно
 * только вместе с тегом (ADR-0074) — выдача по тегу не привязана к горизонту
 * планировщика и смотрит на всю историю школы. Одно поле окна без другого —
 * ошибка и с тегом, и без: половина периода не описывает никакую выборку.
 * Тег проверяется истинностно (`if (tag)`), та же проверка, что у
 * `buildLessonsFilter` — иначе `tag=''` тихо снял бы требование окна.
 * Возвращает `undefined`, если окно законно опущено (список тогда читает
 * всю историю тега, не окно).
 */
export function resolveLessonsWindow(
  from: string | undefined,
  to: string | undefined,
  tag: string | undefined,
): { from: DateTime; to: DateTime } | undefined {
  if (from === undefined && to === undefined) {
    if (tag) return undefined;
    throw new InvalidInputError(WINDOW_OR_TAG_MESSAGE);
  }
  if (from === undefined || to === undefined) {
    throw new InvalidInputError(WINDOW_OR_TAG_MESSAGE);
  }
  const parsedFrom = parseUtcIso(from, 'from');
  const parsedTo = parseUtcIso(to, 'to');
  assertListWindow(parsedFrom, parsedTo);
  return { from: parsedFrom, to: parsedTo };
}
