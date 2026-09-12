// Пояс занятия в интерфейсе (docs/PLAN.md §3: у занятия свой пояс, у
// пользователя — свой из профиля/браузера). Сравнение по имени IANA-зоны, не
// по смещению: смещение плавает с переходом на летнее время, имя — нет.
function browserTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Приписка «· пояс» на карточке рассылки и в предпросмотре шаблона — там
 * дата одна на карточку, повтора не возникает. На «Расписании» и «Занятиях»
 * пояс подписан один раз сверху (tzNote): приписка у каждой строки
 * превращала список в частокол «Asia/Jerusalem» (отзыв владельца 2026-09-12). */
export function tzBadge(
  classTz: string,
  browserTimeZone: string = browserTz(),
): string | null {
  return classTz === browserTimeZone ? null : classTz;
}

/** Пояса занятий, отличающиеся от пояса зрителя — уникальные, в порядке
 * появления. Пустой список означает «зритель и школа живут по одним часам»,
 * тогда подписывать нечего. */
function foreignTimezones(
  classTzs: readonly string[],
  browserTimeZone: string,
): string[] {
  return [...new Set(classTzs)].filter((tz) => tz !== browserTimeZone);
}

/** Подпись под заголовком «Расписания»: в сетке стоит время правила, а
 * правило хранится в поясе школы. */
export function scheduleTzNote(
  classTzs: readonly string[],
  browserTimeZone: string = browserTz(),
): string | null {
  const foreign = foreignTimezones(classTzs, browserTimeZone);
  if (foreign.length === 0) return null;
  return `Время в сетке — по часам школы (${foreign.join(', ')}).`;
}

/** Подпись под заголовком «Занятий»: там время конкретной даты, показанное в
 * поясе зрителя, — и без этой строки оно читается как время школы. */
export function planningTzNote(
  classTzs: readonly string[],
  browserTimeZone: string = browserTz(),
): string | null {
  const foreign = foreignTimezones(classTzs, browserTimeZone);
  if (foreign.length === 0) return null;
  return `Время — по вашим часам. Школа живёт по ${foreign.join(', ')}.`;
}
