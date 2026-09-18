// «Прошло» / «через N часов» / «через N минут» — статус времени у карточек
// «Сегодня» планирования учителя (docs/adr/0043, макет 1c-planning.html) и у
// ближайшего занятия ученика (student/StudentNextLesson.tsx): сколько ждать
// или что занятие уже кончилось, без счёта в уме. `null` — день, отличный от
// сегодня: считать в часах есть смысл только для сегодняшнего занятия, «через
// 30 часов» не то, что хочет прочитать человек (гейт — lib/relativeDay.ts:isToday).
//
// `Date.parse`, не `new Date(iso).getTime()` — тот же приём, что
// attempt/attemptDeadline.ts: нужно только число миллисекунд на вычитание, не
// Date-объект (`new Date(строка)` запрещён в web, CLAUDE.md «Время»,
// NO_DATE_CTOR в eslint.config.mjs). Разница — между двумя абсолютными
// моментами, не подсчёт календарных суток, поэтому переход летнего времени её
// не искажает (в отличие от relativeDay.ts, где сутки бывают 23 или 25 часов):
// час между 10:00 и 11:00 UTC — всегда ровно час, в каком бы поясе ни жил
// зритель.
import { pluralRu } from '@xuanxue/shared';
import { isToday } from './relativeDay';

const PAST_LABEL = 'прошло';
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

// «Через» требует винительного падежа: «час» у «часа» (муж. род) совпадает с
// именительным, а «минута» (жен. род) — нет, поэтому единственное число здесь
// «минуту», не «минута» (иначе «через 21 минута» — грамматическая ошибка;
// не путать с MINUTE_FORMS в attempt/attemptDeadline.ts — там «Осталось»
// требует именительного, форма единственного числа другая).
const HOUR_FORMS = { one: 'час', few: 'часа', many: 'часов', other: 'часа' };
const MINUTE_FORMS = { one: 'минуту', few: 'минуты', many: 'минут', other: 'минуты' };

export function lessonCountdownLabel(
  startsAtIso: string,
  nowIso: string,
  timeZone?: string,
): string | null {
  if (!isToday(startsAtIso, nowIso, timeZone)) return null;

  const diffMs = Date.parse(startsAtIso) - Date.parse(nowIso);
  if (diffMs <= 0) return PAST_LABEL;

  if (diffMs < HOUR_MS) {
    // Не 0: занятие уже сегодня и ещё не началось — «через 0 минут» читалось
    // бы как сбой.
    const minutes = Math.max(1, Math.round(diffMs / MINUTE_MS));
    return `через ${minutes} ${pluralRu(minutes, MINUTE_FORMS)}`;
  }

  const hours = Math.round(diffMs / HOUR_MS);
  return `через ${hours} ${pluralRu(hours, HOUR_FORMS)}`;
}
