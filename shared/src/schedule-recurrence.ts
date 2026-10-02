// «Раз в две недели» у правила расписания (ADR-0168): формат даты первого
// занятия, день недели календарной даты и проверка пары `everyWeeks`/`startsOn`.
// Одна проверка на обе стороны: сервер бросает её текст доменной ошибкой
// (`classes.update.ts`), форма кабинета показывает его же под полем
// (`web/src/schedule/ruleDraft.ts`) — два текста про одну ошибку разошлись бы.
//
// Без Luxon и без `new Date(…)`: `shared` живёт без зависимостей, а конструктор
// с аргументом в бизнес-логике запрещён eslint (CLAUDE.md «Время»). День недели
// даты читает `Intl.DateTimeFormat` в поясе UTC: у календарной даты без
// времени пояса нет, и пятница 2 октября — пятница в любой зоне.
import {
  EVERY_TWO_WEEKS,
  type RuleEveryWeeks,
  type ScheduleRule,
  type Weekday,
} from './domain';

/** Дата первого занятия «ГГГГ-ММ-ДД» (значение `<input type="date">`). Месяц и
 * день проверены по диапазону, календарную возможность (31 апреля) — уже
 * `weekdayOfDate`. Одна на схему Mongoose, DTO и форму. */
export const RULE_DATE_RE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Подписи выбора «как часто» в форме правила. */
export const EVERY_WEEKS_LABELS_RU: Record<RuleEveryWeeks, string> = {
  1: 'Каждую неделю',
  2: 'Раз в две недели',
};

/** Тихая подпись слота в расписании и в списке «о каких занятиях напоминать». */
export const EVERY_TWO_WEEKS_NOTE_RU = 'раз в 2 недели';

/** День недели в винительном падеже: «выпадает на пятницу». */
export const WEEKDAY_ACCUSATIVE_RU: Record<Weekday, string> = {
  0: 'воскресенье',
  1: 'понедельник',
  2: 'вторник',
  3: 'среду',
  4: 'четверг',
  5: 'пятницу',
  6: 'субботу',
};

const WEEKDAY_BY_EN_SHORT = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
} as const satisfies Record<string, Weekday>;

const DATE_FIELDS: Intl.DateTimeFormatOptions = {
  timeZone: 'UTC',
  weekday: 'short',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
};

/** День недели календарной даты «ГГГГ-ММ-ДД» в школьной нумерации (0 = Вс).
 * `null` — не тот формат или даты нет в календаре (31 апреля, 30 февраля). */
export function weekdayOfDate(date: string): Weekday | null {
  const match = RULE_DATE_RE.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parts = new Intl.DateTimeFormat('en-US', DATE_FIELDS).formatToParts(
    Date.UTC(year, month - 1, day),
  );
  const fields = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  // `Date.UTC` молча переносит «31 апреля» на 1 мая, а год 0050 — на 1950-й:
  // собранный день сверяется с исходными числами.
  if (Number(fields.year) !== year) return null;
  if (Number(fields.month) !== month || Number(fields.day) !== day) return null;
  return WEEKDAY_BY_EN_SHORT[fields.weekday as keyof typeof WEEKDAY_BY_EN_SHORT];
}

const START_REQUIRED_MESSAGE =
  'Впишите дату первого занятия: от неё занятие идёт через неделю.';
const START_INVALID_MESSAGE =
  'Дата первого занятия указана неверно. Выберите её в календаре.';

/** Что не так с парой `everyWeeks`/`startsOn` у правила: `null` — всё в
 * порядке. Раз в две недели без даты считать не от чего, а дата не на день
 * правила сдвинула бы счёт на другой день недели. Для еженедельного правила
 * дата не нужна, и её не проверяют: сервер её не хранит. */
export function ruleRecurrenceError(
  rule: Pick<ScheduleRule, 'weekday' | 'everyWeeks' | 'startsOn'>,
): string | null {
  if (rule.everyWeeks !== EVERY_TWO_WEEKS) return null;
  if (!rule.startsOn) return START_REQUIRED_MESSAGE;
  const actual = weekdayOfDate(rule.startsOn);
  if (actual === null) return START_INVALID_MESSAGE;
  if (actual === rule.weekday) return null;
  return (
    `Дата первого занятия выпадает на ${WEEKDAY_ACCUSATIVE_RU[actual]}, ` +
    `а правило стоит на ${WEEKDAY_ACCUSATIVE_RU[rule.weekday]}. ` +
    `Выберите ${WEEKDAY_ACCUSATIVE_RU[rule.weekday]}.`
  );
}
