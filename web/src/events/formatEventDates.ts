// Даты события школы по часам зрителя (ADR-0177): подпись на карточке доски.
// Пояс школы ученику взять неоткуда (GET /settings закрыт ему), поэтому, как
// и на остальных экранах ученика, время — по часам его устройства (ADR-0060).
//
//   одно время           «Сб, 14 ноября, 10:00»
//   начало и конец в    «Сб, 14 ноября, 10:00–16:00»
//   один день
//   несколько дней       «14–16 ноября» или «31 октября – 2 ноября»
//
// У многодневного часов нет: ретрит с заездом в полдень и отъездом в пять
// вечера читается днями, а часы заезда учитель пишет в подробностях.
// Сравнение дней — в поясе зрителя (dateKey), а не по UTC: событие в 01:30 по
// Израилю на UTC лежит накануне, и «один день» не должен зависеть от этого.
import type { SchoolEventDto } from '@xuanxue/shared';
import { dateKey, formatDateTime, formatDayMonth, formatTime } from '../lib/formatDate';

const RANGE_DASH = '–';
const RANGE_DASH_SPACED = ` ${RANGE_DASH} `;
// «2026-10» — год и месяц из ключа дня «2026-10-24».
const YEAR_MONTH_LENGTH = 7;

// Только число дня: «14» — для «14–16 ноября», где месяц называется один раз.
function formatDayNumber(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', timeZone }).format(
    Date.parse(iso),
  );
}

export function formatEventDates(
  event: Pick<SchoolEventDto, 'startsAt' | 'endsAt'>,
  timeZone?: string,
): string {
  const { startsAt, endsAt } = event;
  const start = formatDateTime(startsAt, timeZone);
  if (!endsAt) return start;

  const startDay = dateKey(startsAt, timeZone);
  const endDay = dateKey(endsAt, timeZone);
  if (startDay === endDay) {
    return `${start}${RANGE_DASH}${formatTime(endsAt, timeZone)}`;
  }

  const sameMonth =
    startDay.slice(0, YEAR_MONTH_LENGTH) === endDay.slice(0, YEAR_MONTH_LENGTH);
  if (sameMonth) {
    return `${formatDayNumber(startsAt, timeZone)}${RANGE_DASH}${formatDayMonth(endsAt, timeZone)}`;
  }
  return `${formatDayMonth(startsAt, timeZone)}${RANGE_DASH_SPACED}${formatDayMonth(endsAt, timeZone)}`;
}
