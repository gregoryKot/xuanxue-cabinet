// Сколько осталось до дедлайна попытки (ТЗ п.2; отзыв владельца 2026-09-21 —
// таймер с секундами, а не тусклая строка раз в 30 секунд) — чистая функция
// без DOM, юнит-тест без похода в сеть (CLAUDE.md «Тесты»). Считает не
// бизнес-правило (время экзамена закрывает сервер —
// ExamAttemptsService.closeIfExpiredAttempt, ТЗ 4.4 п.7), а только то, что
// показать на экране прямо сейчас; рисует результат AttemptDeadlineTimer.tsx.
// `Date.parse`, не `new Date(deadlineAt).getTime()` — тот же результат без
// конструктора с аргументом (запрещён NO_DATE_CTOR в web, CLAUDE.md «Время»,
// M10 аудита 2026-09-12): нужно только число миллисекунд для вычитания.
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const MINUTE_MS = SECONDS_PER_MINUTE * MS_PER_SECOND;
const HOUR_MS = MINUTES_PER_HOUR * MINUTE_MS;

/** Порог «тревожного» тона (AttemptDeadlineTimer.tsx) — меньше этого
 * остатка отсчёт становится заметной пилюлей, а не тихой строкой. */
const WARNING_THRESHOLD_MS = 5 * MINUTE_MS;
/** Порог второй, более срочной фразы для скринридера. */
const LAST_MINUTE_THRESHOLD_MS = MINUTE_MS;

const WARNING_ANNOUNCEMENT = 'Осталось меньше 5 минут';
const LAST_MINUTE_ANNOUNCEMENT = 'Осталось меньше минуты';

export interface AttemptTimeStatus {
  /** Дедлайна нет вовсе — форма без лимита времени. */
  hasDeadline: boolean;
  expired: boolean;
  /** Строка отсчёта для экрана; `null`, когда дедлайна нет или он истёк. */
  label: string | null;
  /** Последние минуты — рисуем тревожным тоном. */
  warning: boolean;
  /** Огрублённая фраза для скринридера: меняется два раза за попытку, а не
   * раз в секунду, поэтому её можно объявлять `role="status"`. */
  announcement: string | null;
}

// Час и больше — «2 ч 15 мин» (и «2 ч» без «0 мин» на ровный час); меньше
// часа — «12:34» (минуты без ведущего нуля, секунды всегда двумя знаками,
// «0:07»). Секунды в первом варианте не нужны: на часах точность до минуты
// достаточна, а дробить внимание ученика на неё незачем.
function formatLabel(remainingMs: number): string {
  if (remainingMs >= HOUR_MS) {
    const hours = Math.floor(remainingMs / HOUR_MS);
    const minutes = Math.floor((remainingMs % HOUR_MS) / MINUTE_MS);
    return minutes === 0 ? `Осталось ${hours} ч` : `Осталось ${hours} ч ${minutes} мин`;
  }
  const totalSeconds = Math.floor(remainingMs / MS_PER_SECOND);
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return `Осталось ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getAnnouncement(remainingMs: number): string | null {
  if (remainingMs < LAST_MINUTE_THRESHOLD_MS) return LAST_MINUTE_ANNOUNCEMENT;
  if (remainingMs < WARNING_THRESHOLD_MS) return WARNING_ANNOUNCEMENT;
  return null;
}

export function getAttemptTimeStatus(
  deadlineAt: string | undefined,
  nowMs: number,
): AttemptTimeStatus {
  if (!deadlineAt) {
    return {
      hasDeadline: false,
      expired: false,
      label: null,
      warning: false,
      announcement: null,
    };
  }

  const remainingMs = Date.parse(deadlineAt) - nowMs;
  if (remainingMs <= 0) {
    return {
      hasDeadline: true,
      expired: true,
      label: null,
      warning: false,
      announcement: null,
    };
  }

  return {
    hasDeadline: true,
    expired: false,
    label: formatLabel(remainingMs),
    warning: remainingMs < WARNING_THRESHOLD_MS,
    announcement: getAnnouncement(remainingMs),
  };
}
