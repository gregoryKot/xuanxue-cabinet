// Конец календарного дня в заданном поясе — одна функция на обе точки ввода
// срока сдачи (`dueAt`, ADR-0125): поле «Сдать до» в кабинете
// (web/src/exams/examDueInput.ts) и пресет в боте
// (api/src/telegram/handlers/new-exam-due.ts, ADR-0127). До аудита
// 2026-10-01 (F61) кабинет считал 23:59:59.999 по часам браузера учителя, а
// бот — по часам школы: одна и та же дата «2 октября» давала разные моменты,
// если учитель ставил срок с устройства не в поясе школы. Теперь оба считают
// по SCHOOL_TZ (ADR-0127, уточнение 2026-10-02); бот остаётся на Luxon, а
// спек new-exam-due.spec.ts сверяет, что две реализации дают один ISO.
//
// Без Luxon и без `new Date(число)`: `shared` живёт без зависимостей, а
// конструктор с аргументом в бизнес-логике запрещён eslint (CLAUDE.md
// «Время»). Стену часов пояса читает `Intl.DateTimeFormat.formatToParts`,
// момент собирает `Date.UTC`, ISO собирается из частей в поясе UTC.

const DATE_VALUE = /^(\d{4})-(\d{2})-(\d{2})$/;
// Последняя миллисекунда дня — «до какого числа включительно».
const END_OF_DAY = { hour: 23, minute: 59, second: 59, ms: 999 } as const;

const WALL_PARTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
};

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Стена часов момента `ms` в поясе `timeZone` — числами, не строкой. */
function wallClock(ms: number, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    ...WALL_PARTS,
    timeZone,
  }).formatToParts(ms);
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // h23 даёт «00..23», но некоторые движки отдают «24» для полуночи —
    // приводим по модулю, чтобы не промахнуться на сутки.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  };
}

/** Смещение пояса в миллисекундах на момент `ms`: стена часов минус UTC. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const wall = wallClock(ms, timeZone);
  const wallAsUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // formatToParts не отдаёт миллисекунды — убираем их из `ms` той же мерой.
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

/** Календарно возможная дата: `Date.UTC` молча переносит «31 апреля» на май,
 * поэтому собранный момент сверяется с исходными числами. */
function isCalendarDate(year: number, month: number, day: number): boolean {
  const wall = wallClock(Date.UTC(year, month - 1, day), 'UTC');
  return wall.year === year && wall.month === month && wall.day === day;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** ISO UTC момента `ms` — из частей в поясе UTC, не через `new Date(ms)`
 * (запрещён в shared, см. шапку). Миллисекунды — свои, Intl их не отдаёт. */
function toIsoUtc(ms: number, millis: number): string {
  const wall = wallClock(ms, 'UTC');
  return (
    `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}` +
    `T${pad2(wall.hour)}:${pad2(wall.minute)}:${pad2(wall.second)}.${String(millis).padStart(3, '0')}Z`
  );
}

/** Значение `<input type="date">` («2026-10-02») → ISO UTC конца этого дня
 * (23:59:59.999) в поясе `timeZone`. `null` — пустая строка, не тот формат
 * или календарно невозможная дата (13-й месяц, 31 апреля).
 *
 * Смещение пояса берётся дважды: сперва на «наивный» момент, потом на уже
 * сдвинутый — в день перехода на летнее/зимнее время смещение в 23:59 другое,
 * чем в полночь UTC того же числа, и одна итерация промахнулась бы на час. */
export function endOfDayInZoneIso(dateValue: string, timeZone: string): string | null {
  const match = DATE_VALUE.exec(dateValue);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isCalendarDate(year, month, day)) return null;

  const naiveMs = Date.UTC(
    year,
    month - 1,
    day,
    END_OF_DAY.hour,
    END_OF_DAY.minute,
    END_OF_DAY.second,
  );
  const firstGuess = naiveMs - zoneOffsetMs(naiveMs, timeZone);
  const ms = naiveMs - zoneOffsetMs(firstGuess, timeZone);
  // Смещение пояса — целые минуты, поэтому миллисекунды момента известны
  // заранее и в расчёт не входят (формула выше работает на секундах).
  return toIsoUtc(ms, END_OF_DAY.ms);
}
