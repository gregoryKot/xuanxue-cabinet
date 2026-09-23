// Строка «когда сдать» для срока формы (`dueAt`, ADR-0125) — только день и
// час, без Luxon (`shared` живёт без зависимостей, exam-time.ts объясняет
// почему в шапке файла) и без «сегодня/завтра» из formatDeadline там же: срок
// сдачи бывает за недели вперёд, экономия на «сегодня» не нужна, дату видно
// всегда целиком. Отдельный файл, не exam-time.ts — тот уже на потолке
// размера (CLAUDE.md «Храповики», 150 строк), а решение не связано с
// остатком времени попытки, только с самим фактом «до какого числа».
//
// Возвращает голую дату-время, без «Сдать до»/«Срок сдачи» — префикс свой у
// каждого экрана (new-exam-screens.ts зовёт это «Срок сдачи:», exam-list-
// row.ts — «Сдать до»); пояс и приписку решает вызывающая сторона через
// `options`, функция сама не выбирает, чьи это часы.
const DUE_DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
const DUE_CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

export interface ExamDueOptions {
  /** Пояс, в котором показать дату — бот всегда передаёт пояс школы (своих
   * часов зрителя бот не знает, ровно как у describeExamTime). */
  timeZone?: string;
  /** Чьи это часы — приписка сразу за временем. */
  zoneNote?: string | null;
}

/** «30 сентября, 23:59 (Asia/Jerusalem)» — `undefined`/нечитаемая дата →
 * `null`, срока нет или он битый, строки не будет вовсе (та же защита в
 * глубину, что у describeAttemptDeadline). */
export function formatExamDueAt(
  dueAt: string | undefined,
  options: ExamDueOptions = {},
): string | null {
  if (dueAt === undefined) return null;
  const ms = Date.parse(dueAt);
  if (Number.isNaN(ms)) return null;
  const day = new Intl.DateTimeFormat('ru', {
    ...DUE_DAY_FORMAT,
    timeZone: options.timeZone,
  }).format(ms);
  const clock = new Intl.DateTimeFormat('ru', {
    ...DUE_CLOCK_FORMAT,
    timeZone: options.timeZone,
  }).format(ms);
  const note = options.zoneNote ? ` ${options.zoneNote}` : '';
  return `${day}, ${clock}${note}`;
}
