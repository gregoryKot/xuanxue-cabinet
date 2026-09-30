// «пн, вт · 10:00» — дни и время занятия расписания по часам зрителя
// (CLAUDE.md «Время»: интерфейс показывает время устройства, пояс школы
// подписывается один раз над списком — schedule/timezoneLabel.ts,
// `planningTzNote`). Правило хранится в поясе школы: «понедельник 10:00 по
// Иерусалиму» у зрителя в Сиднее — понедельник вечером, а воскресный вечер в
// Иерусалиме там уже понедельник. Поэтому считаем по ближайшему будущему
// повторению правила, а не по смещению «сейчас»: смещения двух поясов
// меняются в разные недели (Израиль переводит часы в последнее воскресенье
// октября, Сидней — в первое), и подпись должна совпасть с тем занятием, о
// котором напомнит ближайшее уведомление.
//
// Luxon в web нет (см. шапку lib/formatDate.ts и lib/relativeDay.ts): пояс и
// его переходы знает `Intl`, а из стены часов в момент строим по стандартной
// схеме «угадай смещение, проверь ещё раз». Момент держим числом миллисекунд
// и не заводим `new Date(число)`: он запрещён в бизнес-логике (eslint), а
// `Intl.DateTimeFormat#formatToParts` и `Date.UTC` работают с числами.
import {
  RULE_TIME_RE,
  WEEKDAYS,
  WEEKDAY_LABELS_RU,
  type LessonScopeClassDto,
  type Weekday,
} from '@xuanxue/shared';

type ClassSlot = LessonScopeClassDto['slots'][number];

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: Weekday;
}

interface ViewerSlot {
  weekday: Weekday;
  time: string;
}

const MS_PER_MINUTE = 60_000;
const HOURS_PER_DAY = 24;
const DAYS_PER_WEEK = 7;
const GROUPS_SEPARATOR = '; ';
const DAYS_SEPARATOR = ', ';
const DAYS_TIME_SEPARATOR = ' · ';

/** Неделя в подписи начинается с понедельника, а не с воскресенья, как
 * `WEEKDAYS` (порядок Luxon/JS): школа считает неделю с понедельника. */
const WEEK_ORDER_MONDAY_FIRST: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

// Короткие английские дни недели у `Intl` — ключ, не зависящий от локали
// зрителя: по месту в списке получаем индекс дня (0 — воскресенье) без
// `Date.getDay()` (тот смотрит на системный пояс, а не на тот, что передан
// форматтеру).
const WEEKDAY_NAMES_EN: readonly string[] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

const formatters = new Map<string, Intl.DateTimeFormat>();

// Форматтер дорог (десятки занятий, по нескольку вызовов на каждое), а пояс
// называется строкой, поэтому кэш — по имени пояса. Пояс устройства попадает в
// ключ уже названным (`deviceTimeZone`), так что его смена, например в тестах,
// кэш не отравляет.
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  formatters.set(timeZone, created);
  return created;
}

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function isWeekday(value: number): value is Weekday {
  return WEEKDAYS.some((weekday) => weekday === value);
}

/** Стена часов момента `ms` в заданном поясе. */
function wallClockAt(ms: number, timeZone: string): WallClock {
  // Приведение типа: форматтер (formatterFor) собран ровно с этими полями,
  // поэтому каждое из них в разборе есть — `Record` по типам частей говорит
  // это компилятору, а проверять «вдруг нет» было бы веткой, которой не бывает.
  const parts = Object.fromEntries(
    formatterFor(timeZone)
      .formatToParts(ms)
      .map(({ type, value }) => [type, value]),
  ) as Record<Intl.DateTimeFormatPartTypes, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Полночь часть движков пишет как 24 даже при `h23`.
    hour: Number(parts.hour) % HOURS_PER_DAY,
    minute: Number(parts.minute),
    weekday: WEEKDAY_NAMES_EN.indexOf(parts.weekday) as Weekday,
  };
}

/** Стена часов как число «будто это UTC» — линейка для разности с самим
 * моментом: `стена − момент` и есть смещение пояса в этот момент. */
function wallAsUtcMs(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

function offsetMs(ms: number, timeZone: string): number {
  // Секунд в стене часов нет — отбрасываем их и у момента, иначе разность
  // поплывёт на них.
  const minuteAligned = ms - (ms % MS_PER_MINUTE);
  return wallAsUtcMs(wallClockAt(minuteAligned, timeZone)) - minuteAligned;
}

/** Момент, в который стена часов пояса показывает `wallAsUtc` (число «стена
 * как UTC»; `Date.UTC` сама переносит день через границу месяца). Первое
 * приближение берёт смещение пояса в самой стене, второе — в найденном
 * моменте: так ловится переход на летнее время между ними. «Несуществующее»
 * время (02:30 в ночь перехода вперёд) сдвигается к ближайшему настоящему. */
function instantOfWall(wallAsUtc: number, timeZone: string): number {
  const guess = wallAsUtc - offsetMs(wallAsUtc, timeZone);
  return wallAsUtc - offsetMs(guess, timeZone);
}

function nextOccurrenceMs(slot: ClassSlot, classTz: string, nowMs: number): number {
  // Формат «HH:mm» проверен до вызова (RULE_TIME_RE в classSlotsLabel).
  const hour = Number(slot.time.slice(0, 2));
  const minute = Number(slot.time.slice(3, 5));
  const today = wallClockAt(nowMs, classTz);
  const daysAhead = (slot.weekday - today.weekday + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  const atDaysAhead = (days: number): number =>
    instantOfWall(
      Date.UTC(today.year, today.month - 1, today.day + days, hour, minute),
      classTz,
    );
  const thisWeek = atDaysAhead(daysAhead);
  // Сегодняшнее занятие, которое уже началось, в следующий раз — через неделю.
  return thisWeek >= nowMs ? thisWeek : atDaysAhead(daysAhead + DAYS_PER_WEEK);
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toViewerSlot(
  slot: ClassSlot,
  classTz: string,
  nowMs: number,
  viewerTz: string,
): ViewerSlot {
  const wall = wallClockAt(nextOccurrenceMs(slot, classTz, nowMs), viewerTz);
  return { weekday: wall.weekday, time: `${pad2(wall.hour)}:${pad2(wall.minute)}` };
}

function firstDayIndex(days: ReadonlySet<Weekday>): number {
  return Math.min(...[...days].map((day) => WEEK_ORDER_MONDAY_FIRST.indexOf(day)));
}

/** Дни с одним временем склеиваются: «пн, вт · 10:00». Группы идут по первому
 * дню недели (с понедельника), внутри группы дни тоже с понедельника. */
function groupByTime(slots: ViewerSlot[]): string[] {
  const daysByTime = new Map<string, Set<Weekday>>();
  for (const { weekday, time } of slots) {
    const days = daysByTime.get(time) ?? new Set<Weekday>();
    days.add(weekday);
    daysByTime.set(time, days);
  }
  return [...daysByTime.entries()]
    .sort(
      ([timeA, daysA], [timeB, daysB]) =>
        firstDayIndex(daysA) - firstDayIndex(daysB) || timeA.localeCompare(timeB),
    )
    .map(([time, days]) => {
      const dayLabels = WEEK_ORDER_MONDAY_FIRST.filter((day) => days.has(day)).map(
        (day) => WEEKDAY_LABELS_RU[day].toLowerCase(),
      );
      return `${dayLabels.join(DAYS_SEPARATOR)}${DAYS_TIME_SEPARATOR}${time}`;
    });
}

/**
 * Подпись «пн, вт · 10:00; сб · 12:00» по часам зрителя. `nowIso` — «сейчас»:
 * экран берёт текущий момент, тест — фиксированный (CLAUDE.md «Детерминизм»).
 * `viewerTz` — пояс зрителя, по умолчанию пояс устройства. Занятие без правил
 * (как и правило с кривым днём или временем) даёт пустую строку — подписывать
 * нечем, экран такую строку не рисует.
 */
export function classSlotsLabel(
  slots: LessonScopeClassDto['slots'],
  classTz: string,
  nowIso: string,
  viewerTz: string = deviceTimeZone(),
): string {
  const nowMs = Date.parse(nowIso);
  const viewerSlots = slots
    .filter((slot) => isWeekday(slot.weekday) && RULE_TIME_RE.test(slot.time))
    .map((slot) => toViewerSlot(slot, classTz, nowMs, viewerTz));
  return groupByTime(viewerSlots).join(GROUPS_SEPARATOR);
}
