// Счётчик объяснения выбора (ADR-0146, ТЗ 4.8 доп.) — сколько раз ученик
// выбрал вариант и сколько раз вместе с этим написал непустой текст.
// Отдельным файлом от exam-item-stats.ts: тот стоит у предела размера
// (CLAUDE.md «Храповики»), а это не про статистику вопроса целиком, а про
// одно поле поверх неё — то же разделение, что exam-attempt-submit-reason.ts
// поверх exam-attempts.service.ts.
import type { AttemptAnswerDto } from '@xuanxue/shared';

export interface ReasonStatsAccumulator {
  /** Сколько раз вообще выбрали вариант — знаменатель для reasonGivenCount. */
  optionChosenCount: number;
  /** Сколько раз вместе с выбранным вариантом написали непустое объяснение. */
  reasonGivenCount: number;
}

export function emptyReasonAccumulator(): ReasonStatsAccumulator {
  return { optionChosenCount: 0, reasonGivenCount: 0 };
}

/** Один ответ вопроса с вариантами — зовётся изнутри уже существующего
 * прохода по попыткам (accumulateAttemptStats, exam-item-stats.ts), второго
 * прохода не заводит. Пропущенный вопрос (вариант не выбран) в счёт не
 * идёт — объяснять там нечего (ADR-0146: пропуск вопроса — право ученика). */
export function accumulateReasonStats(
  acc: ReasonStatsAccumulator,
  answer: AttemptAnswerDto | undefined,
  selectedIds: readonly string[],
): void {
  if (selectedIds.length === 0) return;
  acc.optionChosenCount += 1;
  if (answer?.text?.trim()) acc.reasonGivenCount += 1;
}
