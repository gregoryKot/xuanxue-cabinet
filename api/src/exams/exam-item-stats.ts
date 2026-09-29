// Чистая логика статистики вопроса (ТЗ 4.8) — без похода в базу, юнит-тест
// без Mongo (CLAUDE.md «Тесты»). Источник — снимок попытки
// (AttemptBlockRecord/AttemptQuestionRecord, exam-attempt.schema.ts): именно
// он хранит вопрос и отметку «верно» у варианта такими, какими их видел
// сдающий (ADR-0022), поэтому «ответили верно» считается по данным снимка, а
// не по сегодняшней редакции вопроса банка — иначе правка ответа задним
// числом переписывала бы то, что уже произошло. Список вариантов для показа
// учителю, наоборот, строится из текущего вопроса банка (ExamItemOptionRecord)
// — учителю нужно решать, что делать с вопросом сегодня.
import type { AttemptAnswerDto, ExamItemKind, ExamItemStatsDto } from '@xuanxue/shared';
import { checkOptionAnswer } from './exam-attempt-review';
import type { AttemptBlockRecord } from './exam-attempt.schema';
import {
  accumulateReasonStats,
  emptyReasonAccumulator,
  type ReasonStatsAccumulator,
} from './exam-item-reason-stats';
import type { ExamItemOptionRecord } from './exam-item.schema';

// Не отдельный именованный экспорт из shared/src/index.ts (единственный
// файл-баррель проекта и так растёт с каждым слоем, CLAUDE.md «Файлы») — тип
// варианта выводится из формы `ExamItemStatsDto.options`, один источник
// вместо двух.
type ExamItemOptionStatsDto = NonNullable<ExamItemStatsDto['options']>[number];

/** Один сданный ответ, каким его отдаёт `decryptAttempt` (exam-attempt.
 * mapper.ts) — сервис передаёт сюда только `blocks`/`answers`, остальные
 * поля попытки статистике не нужны. */
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

function emptyAccumulator(): ItemStatsAccumulator {
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

/** Один проход по всем сданным попыткам — накопитель на каждый `itemId`,
 * встретившийся в блоке. Статус (`submitted`/`graded`, ТЗ 4.8) уже отобрал вызывающий. */
export function accumulateAttemptStats(
  attempts: readonly AttemptStatsInput[],
): Map<string, ItemStatsAccumulator> {
  const byItem = new Map<string, ItemStatsAccumulator>();
  for (const attempt of attempts) {
    const answerByItemId = new Map(attempt.answers.map((a) => [a.itemId, a]));
    for (const block of attempt.blocks) {
      for (const question of block.questions) {
        const acc = byItem.get(question.itemId) ?? emptyAccumulator();
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
        byItem.set(question.itemId, acc);
      }
    }
  }
  return byItem;
}

/** Статистика одного вопроса — `currentOptions` берётся из сегодняшнего
 * вопроса банка (не из снимков попыток, см. комментарий в начале файла). Без
 * `usedInExamsCount`: отдельный запрос к базе добавляет его сам вызывающий
 * (exam-item-references.ts, ExamItemStatsService.getStats). */
export function computeExamItemStats(
  itemId: string,
  kind: ExamItemKind,
  currentOptions: readonly ExamItemOptionRecord[],
  accByItem: ReadonlyMap<string, ItemStatsAccumulator>,
  // ADR-0146: сегодняшний флаг вопроса, не запись из снимка попытки.
  askReason = false,
): Omit<ExamItemStatsDto, 'usedInExamsCount'> {
  const acc = accByItem.get(itemId) ?? emptyAccumulator();
  const hasOptions = currentOptions.length > 0;
  const showReason = hasOptions && askReason;
  const options: ExamItemOptionStatsDto[] | undefined = hasOptions
    ? currentOptions.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.correct,
        chosenCount: acc.chosenById.get(option.id) ?? 0,
        // Ключа нет вовсе, если картинки не было (ADR-0035) — строка
        // статистики без подписи иначе не с чем сопоставить на экране.
        ...(option.imageId !== undefined ? { imageId: option.imageId } : {}),
      }))
    : undefined;

  return {
    itemId,
    kind,
    askedCount: acc.askedCount,
    correctCount: hasOptions ? acc.correctCount : undefined,
    correctRate:
      hasOptions && acc.askedCount > 0 ? acc.correctCount / acc.askedCount : undefined,
    options,
    reasonCount: showReason ? acc.reason.reasonGivenCount : undefined,
    reasonAnsweredCount: showReason ? acc.reason.optionChosenCount : undefined,
  };
}

/** Сколько заданных вопросов с вариантами отвечают верно реже половины
 * случаев (строго меньше 0.5). Число для карточки-ссылки «Вопросы»
 * (shared/src/exam-item-stats.ts, `ExamItemStatsSummaryDto`). */
export function computeStrugglingCount(
  items: readonly { id: string; options: readonly ExamItemOptionRecord[] }[],
  accByItem: ReadonlyMap<string, ItemStatsAccumulator>,
): number {
  let count = 0;
  for (const item of items) {
    if (item.options.length === 0) continue;
    const acc = accByItem.get(item.id);
    if (!acc || acc.askedCount === 0) continue;
    if (acc.correctCount / acc.askedCount < 0.5) count += 1;
  }
  return count;
}
