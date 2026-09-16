// «сегодня» / «завтра» / «вс, 20 сентября» — подпись дня рядом с крупным
// временем ближайшего занятия (макет Student.dc.html). Чистая логика без
// DOM и без сети: юнит-тест на все ветки и на переход летнего времени
// (CLAUDE.md «Тесты», «Время»).
//
// Считается по календарным ключам `dateKey` (formatDate.ts), а не вычитанием
// миллисекунд из самих моментов: в ночь перехода на летнее время сутки длятся
// 23 или 25 часов, и «завтра» съезжало бы на «сегодня» или «послезавтра».
// `dateKey` приводит момент к календарному дню нужного пояса силами
// `Intl.DateTimeFormat`; Luxon сюда не тянется — в web его нет вовсе, ради
// вывода даты на экране он не окупается (см. шапку lib/formatDate.ts).
import { dateKey, formatDayHeading } from './formatDate';

const TODAY = 'сегодня';
const TOMORROW = 'завтра';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

/** Порядковый номер календарного дня из ключа «2026-09-20». Полночь UTC —
 * просто линейка для нумерации: в UTC перехода на летнее время нет, поэтому
 * разность соседних дней здесь ровно единица. Пояс читателя уже учтён —
 * `dateKey` вернул день именно в нём.
 *
 * `Date.parse` без `new Date`: дата без времени по ECMA-262 читается как
 * полночь UTC — ровно то, что нужно, и без разбора строки на части с
 * запасными значениями, которые никогда не сработают (`dateKey` строит ключ
 * сам и всегда полный). */
function dayNumber(key: string): number {
  return Date.parse(key) / MS_IN_DAY;
}

/**
 * `iso` — момент занятия, `nowIso` — «сейчас» (экран берёт текущий момент,
 * тест — фиксированный). `timeZone` — пояс читателя, по умолчанию браузерный.
 */
export function relativeDayLabel(iso: string, nowIso: string, timeZone?: string): string {
  const distance =
    dayNumber(dateKey(iso, timeZone)) - dayNumber(dateKey(nowIso, timeZone));
  if (distance === 0) return TODAY;
  if (distance === 1) return TOMORROW;
  return formatDayHeading(iso, timeZone);
}
