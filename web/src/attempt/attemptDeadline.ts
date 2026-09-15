// Сколько осталось до дедлайна попытки (ТЗ п.2) — чистая функция без DOM,
// юнит-тест без похода в сеть (CLAUDE.md «Тесты»). Считает не бизнес-правило
// (время экзамена закрывает сервер — ExamAttemptsService.closeIfExpiredAttempt,
// ТЗ 4.4 п.7), а только то, что показать на экране прямо сейчас.
// `Date.parse`, не `new Date(deadlineAt).getTime()` — тот же результат без
// конструктора с аргументом (запрещён NO_DATE_CTOR в web, CLAUDE.md «Время»,
// M10 аудита 2026-09-12): нужно только число миллисекунд для вычитания.
import { pluralRu } from '@xuanxue/shared';

const MINUTE_FORMS = { one: 'минута', few: 'минуты', many: 'минут', other: 'минуты' };
const LESS_THAN_MINUTE_LABEL = 'Осталось меньше минуты';

export interface AttemptTimeStatus {
  /** Дедлайна нет вовсе — форма без лимита времени. */
  hasDeadline: boolean;
  expired: boolean;
  /** Есть только пока не истекло; текст для экрана. */
  label: string | null;
}

export function getAttemptTimeStatus(
  deadlineAt: string | undefined,
  nowMs: number,
): AttemptTimeStatus {
  if (!deadlineAt) return { hasDeadline: false, expired: false, label: null };

  const remainingMs = Date.parse(deadlineAt) - nowMs;
  if (remainingMs <= 0) return { hasDeadline: true, expired: true, label: null };

  const minutes = Math.floor(remainingMs / 60_000);
  const label =
    minutes < 1
      ? LESS_THAN_MINUTE_LABEL
      : `Осталось ${minutes} ${pluralRu(minutes, MINUTE_FORMS)}`;
  return { hasDeadline: true, expired: false, label };
}
