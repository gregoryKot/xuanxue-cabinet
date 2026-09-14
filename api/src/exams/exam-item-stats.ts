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

/** Накопитель по одному вопросу за один проход по попыткам. */
export interface ItemStatsAccumulator {
  askedCount: number;
  correctCount: number;
  chosenById: Map<string, number>;
}

function emptyAccumulator(): ItemStatsAccumulator {
  return { askedCount: 0, correctCount: 0, chosenById: new Map() };
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
 * встретившийся хоть в одном блоке. Вызывающий уже отобрал только
 * `submitted`/`graded` попытки (ТЗ 4.8) — здесь фильтра по статусу нет. */
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
          const selectedIds = answerByItemId.get(question.itemId)?.optionIds ?? [];
          for (const id of selectedIds) {
            acc.chosenById.set(id, (acc.chosenById.get(id) ?? 0) + 1);
          }
          if (isFullyCorrect(question.options, selectedIds)) acc.correctCount += 1;
        }
        byItem.set(question.itemId, acc);
      }
    }
  }
  return byItem;
}

/** Статистика одного вопроса — `currentOptions` берётся из сегодняшнего
 * вопроса банка (не из снимков попыток, см. комментарий в начале файла). */
export function computeExamItemStats(
  itemId: string,
  kind: ExamItemKind,
  currentOptions: readonly ExamItemOptionRecord[],
  accByItem: ReadonlyMap<string, ItemStatsAccumulator>,
): ExamItemStatsDto {
  const acc = accByItem.get(itemId) ?? emptyAccumulator();
  const hasOptions = currentOptions.length > 0;
  const options: ExamItemOptionStatsDto[] | undefined = hasOptions
    ? currentOptions.map((option) => ({
        id: option.id,
        text: option.text,
        correct: option.correct,
        chosenCount: acc.chosenById.get(option.id) ?? 0,
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
  };
}

/** Сколько вопросов с вариантами, которые хоть раз задавали, отвечают верно
 * реже, чем в половине случаев (строго меньше 0.5 — ровно половина ещё не
 * повод переписывать формулировку). Число для карточки-ссылки «Вопросы»
 * (shared/src/exam-item-stats.ts, комментарий у `ExamItemStatsSummaryDto`). */
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
