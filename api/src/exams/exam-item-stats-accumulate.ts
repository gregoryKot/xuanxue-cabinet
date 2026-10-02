// Накопитель статистики вопроса (ТЗ 4.8) — один проход по сданным попыткам,
// без похода в базу, юнит-тест без Mongo (CLAUDE.md «Тесты»). Вынесен из
// exam-item-stats.ts: тот упёрся в потолок размера (CLAUDE.md «Храповики»),
// а аудит 2026-10-01 (F32) потребовал кормить накопитель батчами курсора,
// не всем списком попыток разом — отсюда параметр `into`. Источник — снимок
// попытки (AttemptBlockRecord, exam-attempt.schema.ts): он хранит вопрос и
// отметку «верно» у варианта такими, какими их видел сдающий (ADR-0022).
import type { AttemptAnswerDto } from '@xuanxue/shared';
import { checkOptionAnswer } from './exam-attempt-review';
import type { AttemptBlockRecord } from './exam-attempt.schema';
import {
  accumulateReasonStats,
  emptyReasonAccumulator,
  type ReasonStatsAccumulator,
} from './exam-item-reason-stats';
import type { ExamItemOptionRecord } from './exam-item.schema';

/** Один сданный ответ, каким его отдаёт `decryptAttempt` (exam-attempt.
 * mapper.ts) — сервис передаёт сюда только `blocks`/`answers`, остальные
 * поля попытки статистике не нужны (и с базы не читаются — F32). */
export interface AttemptStatsInput {
  blocks: readonly AttemptBlockRecord[];
  answers: readonly AttemptAnswerDto[];
}

/** Накопитель по одному вопросу за один проход. `reason` — объяснение выбора
 * (ADR-0146, exam-item-reason-stats.ts); показывать ли его — решает computeExamItemStats. */
export interface ItemStatsAccumulator {
  askedCount: number;
  correctCount: number;
  chosenById: Map<string, number>;
  reason: ReasonStatsAccumulator;
}

export function emptyAccumulator(): ItemStatsAccumulator {
  return {
    askedCount: 0,
    correctCount: 0,
    chosenById: new Map(),
    reason: emptyReasonAccumulator(),
  };
}

/** Ответ «полностью верный» — то же правило, что у автопроверки в карточке
 * проверки (checkOptionAnswer, exam-attempt-review.ts): выбраны все верные
 * варианты и ни одного лишнего (CLAUDE.md «Одна механика — один компонент»:
 * не второе определение «верно» рядом с уже существующим). */
function isFullyCorrect(
  options: readonly ExamItemOptionRecord[],
  selectedIds: readonly string[],
): boolean {
  const check = checkOptionAnswer(options, selectedIds);
  return (
    check.correctSelectedCount === check.correctTotalCount &&
    check.incorrectSelectedCount === 0
  );
}

/** Проход по сданным попыткам — накопитель на каждый `itemId`, встретившийся
 * в блоке. Статус (`submitted`/`graded`, ТЗ 4.8) уже отобрал вызывающий.
 * `into` — накопители прошлых батчей того же прохода (F32): результат не
 * зависит от того, пришли попытки одним списком или по частям. */
export function accumulateAttemptStats(
  attempts: readonly AttemptStatsInput[],
  into: Map<string, ItemStatsAccumulator> = new Map(),
): Map<string, ItemStatsAccumulator> {
  for (const attempt of attempts) {
    const answerByItemId = new Map(attempt.answers.map((a) => [a.itemId, a]));
    for (const block of attempt.blocks) {
      for (const question of block.questions) {
        const acc = into.get(question.itemId) ?? emptyAccumulator();
        acc.askedCount += 1;
        if (question.options.length > 0) {
          const answer = answerByItemId.get(question.itemId);
          const selectedIds = answer?.optionIds ?? [];
          for (const id of selectedIds) {
            acc.chosenById.set(id, (acc.chosenById.get(id) ?? 0) + 1);
          }
          if (isFullyCorrect(question.options, selectedIds)) acc.correctCount += 1;
          accumulateReasonStats(acc.reason, answer, selectedIds);
        }
        into.set(question.itemId, acc);
      }
    }
  }
  return into;
}
