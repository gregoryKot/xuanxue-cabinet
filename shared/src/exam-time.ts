// Сколько времени у ученика на экзамен — одна формулировка на кабинет и на
// бота (отзыв владельца 2026-09-22: «на карточках экзаменов дата дедлайна и
// продолжительность/оставшееся время»). Время попытки идёт, пока ученик
// вышел: дедлайн абсолютный (`startedAt + timeLimitMin`, exam-attempt-start.ts),
// пауз нет, и просроченную попытку сервер закрывает сам — лениво на любом
// запросе и тиком раз в минуту (ADR-0122). Значит ученик обязан видеть
// остаток до того, как он кончится, на обоих экранах одинаково.
//
// Здесь же, а не в my-exams.ts рядом с `getMyExamAction`, только из-за
// размера файла (CLAUDE.md «Храповики», 150 строк) — правило то же и такое
// же общее: разъехавшиеся формулировки кабинета и бота уже стоили нам
// ADR-0091.
//
// Срок сдачи («сдать до такого-то числа», `dueAt`) — второе, независимое
// ограничение (ADR-0124): `timeLimitMin` остаётся длиной одной попытки, и
// весь расчёт остатка выше считается от него, срока не касаясь. Сравнение
// «срок уже прошёл» — отдельная, более простая функция внизу файла
// (isExamDuePassed): ей не нужны ни Intl, ни пояс, только сравнение моментов.
//
// Luxon сюда не тянется: `shared` живёт без зависимостей (eslint, слои), а
// вся арифметика — одно вычитание миллисекунд; стену часов рисует `Intl` с
// явным поясом, он же знает про переход на летнее время (спек).
import { formatDurationRu } from './format-duration';
import type { MyExamDto } from './my-exams';

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

const CLOCK_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};
const DAY_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' };
// en-CA сразу даёт «2026-09-23» — сравнивать календарные дни строкой проще,
// чем собирать их по частям (тот же приём, что `dateKey` в web/lib/formatDate.ts).
const DAY_KEY_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
};

const LIMIT_PREFIX = 'На попытку даётся';
const LEFT_PREFIX = 'Осталось';
const CLOSES_AT = 'попытка закроется';
// Дедлайн уже прошёл, а сервер ещё не успел закрыть попытку (между тиком и
// следующим запросом). Честнее показать правду, чем отсчёт в минус: кнопка
// «Продолжить» рядом упрётся в то же самое закрытие на сервере.
const TIME_IS_UP = 'Время попытки вышло';

export interface ExamTimeOptions {
  /** «Сейчас» в миллисекундах — приходит снаружи, а не из `Date.now()`:
   * у бота это `now` хендлера, у кабинета — тикающий `useNow`, в тестах —
   * фиксированный момент (CLAUDE.md «Детерминизм»). */
  nowMs: number;
  /** Пояс, в котором показать час закрытия: кабинет не передаёт ничего и
   * получает часы устройства зрителя (ADR-0060), бот — пояс школы, чужих
   * часов он не знает. */
  timeZone?: string;
  /** Чьи это часы — приписка сразу за временем, когда её нужно назвать
   * (у зрителя пояс не школьный; бот подписывает всегда). */
  zoneNote?: string | null;
}

/** «25 мин», «2 ч», «2 ч 15 мин» — те же сокращения, что у живого отсчёта на
 * экране сдачи (web/src/attempt/attemptDeadline.ts): один продукт, одна
 * запись остатка. Округление вверх, а не вниз: пока идёт последняя минута,
 * честнее «1 мин», чем «0 мин» у ещё открытой попытки. */
function formatTimeLeft(remainingMs: number): string {
  const minutes = Math.ceil(remainingMs / MS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `${minutes} мин`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const restMinutes = minutes % MINUTES_PER_HOUR;
  return restMinutes === 0 ? `${hours} ч` : `${hours} ч ${restMinutes} мин`;
}

function dayKey(ms: number, timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { ...DAY_KEY_FORMAT, timeZone }).format(ms);
}

/** «в 19:40», а через полночь — «23 сентября в 09:00»: лимит бывает до 10
 * часов (EXAM_LIMITS.timeLimitMinMax), и попытка, начатая вечером, закроется
 * уже завтра — голый час там читался бы как сегодняшний. */
function formatDeadline(
  deadlineMs: number,
  nowMs: number,
  timeZone: string | undefined,
): string {
  const clock = new Intl.DateTimeFormat('ru', { ...CLOCK_FORMAT, timeZone }).format(
    deadlineMs,
  );
  if (dayKey(deadlineMs, timeZone) === dayKey(nowMs, timeZone)) return `в ${clock}`;
  const day = new Intl.DateTimeFormat('ru', { ...DAY_FORMAT, timeZone }).format(
    deadlineMs,
  );
  return `${day} в ${clock}`;
}

/** Остаток одной попытки по её дедлайну — без данных формы (`timeLimitMin`
 * тут не при чём: попытка уже идёт, а не только предстоит). Своя функция, а
 * не внутренность describeExamTime, — потому что на экране вопроса в боте
 * (exam-question-render.ts, отзыв владельца 2026-09-22: «на экране вопроса
 * про время не сказано») на руках `ExamAttemptDto`, не `MyExamDto`, и
 * лимита формы там нет вовсе; собирать чужой DTO ради одного поля хуже, чем
 * вынести саму арифметику. `null` — дедлайн в ответе нечитаемый (защита в
 * глубину, тот же случай, что ниже в describeExamTime): молчание надёжнее
 * неправды «время вышло». */
export function describeAttemptDeadline(
  deadlineAt: string,
  options: ExamTimeOptions,
): string | null {
  const deadlineMs = Date.parse(deadlineAt);
  const remainingMs = deadlineMs - options.nowMs;
  if (Number.isNaN(remainingMs)) return null;
  if (remainingMs <= 0) return TIME_IS_UP;

  const when = formatDeadline(deadlineMs, options.nowMs, options.timeZone);
  const note = options.zoneNote ? ` ${options.zoneNote}` : '';
  return `${LEFT_PREFIX} ${formatTimeLeft(remainingMs)}, ${CLOSES_AT} ${when}${note}`;
}

/** Строка про время одной формы для карточки кабинета и строки бота.
 * `null` — у формы нет лимита времени, и говорить нечего: строки не будет
 * вовсе, а не «без ограничения» пустым местом.
 *
 * Три состояния: попытки ещё нет (или прошлая уже закрыта) — сколько времени
 * даётся; попытка идёт — сколько осталось и когда закроется; дедлайн прошёл,
 * а закрытие ещё не доехало — «время вышло». */
export function describeExamTime(
  exam: MyExamDto,
  options: ExamTimeOptions,
): string | null {
  if (!exam.timeLimitMin) return null;
  const limitLine = `${LIMIT_PREFIX} ${formatDurationRu(exam.timeLimitMin)}`;

  const attempt = exam.lastAttempt;
  const deadlineAt = attempt?.status === 'in_progress' ? attempt.deadlineAt : undefined;
  if (!deadlineAt) return limitLine;

  // NaN (дедлайн в ответе нечитаемый) тоже возвращает null здесь — фолбэк тот
  // же, что раньше: продолжительность вместо «NaN мин».
  return describeAttemptDeadline(deadlineAt, options) ?? limitLine;
}

/** Срок сдачи прошёл — сравнение абсолютных моментов, пояс тут ни при чём
 * (в отличие от formatDeadline выше): `dueAt` уже ISO UTC. Нет срока — не
 * прошёл, ограничения нет вовсе. Одна реализация на сервис (закрывает
 * только НОВЫЕ попытки — ExamAttemptsService.start, идущую не трогает
 * никогда) и на карточку кабинета (прячет кнопку старта) — решение
 * владельца 2026-09-22, ADR-0124. `Date.parse` вместо `new Date` — та же
 * оговорка про Luxon и арифметику на миллисекундах, что в шапке файла. */
export function isExamDuePassed(dueAt: string | undefined, nowMs: number): boolean {
  return dueAt !== undefined && nowMs >= Date.parse(dueAt);
}
