// Форматтеры дат/времени для экранов «Сводка», «Планирование», «Рассылки»
// (CLAUDE.md «Время»): бизнес-логика времени считается на сервере (Luxon),
// здесь только отображение готового ISO UTC в поясе браузера — Luxon в web
// не нужен, как и в web/src/schedule/scheduleGrid.ts. `timeZone` —
// необязательный параметр (тестам нужен фиксированный пояс, экрану —
// браузерный по умолчанию, см. schedule/timezoneLabel.ts:browserTz).
import { WEEKDAY_LABELS_RU, type Weekday } from '@xuanxue/shared';

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};
const DAY_MONTH_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };

/** Индекс дня недели ISO-строки в заданном поясе — через готовый `dateKey`
 * («YYYY-MM-DD» в нужном поясе), не `Date.getDay()` напрямую: тот всегда
 * смотрит на системный пояс окружения, а не на `timeZone`, переданный
 * форматтеру. Дата без времени (`new Date('YYYY-MM-DD')`) парсится как
 * полночь UTC (ECMA-262) — `getUTCDay()` даёт день недели без обращения к
 * локали и без фолбэка на случай неожиданного ответа `Intl`. */
function weekdayIndex(date: Date, timeZone?: string): Weekday {
  return new Date(dateKey(date.toISOString(), timeZone)).getUTCDay() as Weekday;
}

export function formatTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('ru', { ...TIME_FORMAT, timeZone }).format(
    new Date(iso),
  );
}

/** «Вс, 7 сентября» — заголовок группы дня в «Планировании». */
export function formatDayHeading(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const weekday = WEEKDAY_LABELS_RU[weekdayIndex(date, timeZone)];
  const dayMonth = new Intl.DateTimeFormat('ru', {
    ...DAY_MONTH_FORMAT,
    timeZone,
  }).format(date);
  return `${weekday}, ${dayMonth}`;
}

/** «Вс, 7 сентября, 19:00» — дата и время одной строкой (карточка «Сводки»). */
export function formatDateTime(iso: string, timeZone?: string): string {
  return `${formatDayHeading(iso, timeZone)}, ${formatTime(iso, timeZone)}`;
}

/** Ключ календарного дня «2026-09-07» в заданном поясе — группировка занятий
 * по дню (en-CA сразу даёт порядок год-месяц-день, без ручной сборки строки). */
export function dateKey(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

/** ISO UTC → значение `<input type="datetime-local">` в поясе браузера —
 * сам инпут не понимает других поясов, поэтому без параметра `timeZone`. */
export function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Значение `datetime-local` (пояс браузера, без смещения в строке) → ISO UTC.
 * `null` — поле пустое или браузер прислал нераспознаваемую строку. */
export function fromDatetimeLocalValue(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
