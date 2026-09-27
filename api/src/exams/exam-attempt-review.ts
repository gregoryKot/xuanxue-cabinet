// Чистые функции карточки проверки (ТЗ 4.6, п.3) — без похода в базу, юнит-
// тест без Mongo (CLAUDE.md «Тесты»). Источник — снимок попытки
// (AttemptQuestionRecord/AttemptOptionRecord, exam-attempt.schema.ts): он уже
// хранит `correct` варианта, брать его заново из банка нельзя — вопрос могли
// переписать (ADR-0022). Автопроверка вариантов честна только
// там, где сдающий выбирает готовый вариант — вопрос без вариантов (текст,
// видео) эта функция не зовёт.
import type {
  AttemptAnswerDto,
  AttemptOptionCheckDto,
  AttemptReviewBlockDto,
  AttemptReviewOptionDto,
  AttemptReviewQuestionDto,
} from '@xuanxue/shared';
import type {
  AttemptBlockRecord,
  AttemptOptionRecord,
  AttemptQuestionRecord,
} from './exam-attempt.schema';

/** Сколько верных вариантов выбрал ученик из скольких верных всего у
 * вопроса, и сколько лишних (неверных) выбрал вместе с ними. */
export function checkOptionAnswer(
  options: readonly AttemptOptionRecord[],
  selectedIds: readonly string[],
): AttemptOptionCheckDto {
  const selected = new Set(selectedIds);
  let correctTotalCount = 0;
  let correctSelectedCount = 0;
  let incorrectSelectedCount = 0;
  for (const option of options) {
    if (option.correct) {
      correctTotalCount += 1;
      if (selected.has(option.id)) correctSelectedCount += 1;
    } else if (selected.has(option.id)) {
      incorrectSelectedCount += 1;
    }
  }
  return { correctSelectedCount, correctTotalCount, incorrectSelectedCount };
}

function toReviewOption(
  option: AttemptOptionRecord,
  selected: ReadonlySet<string>,
): AttemptReviewOptionDto {
  return {
    id: option.id,
    text: option.text,
    correct: option.correct,
    selected: selected.has(option.id),
    // Ключа нет вовсе, если картинки не было (ADR-0035), как у остальных
    // мапперов снимка.
    ...(option.imageId !== undefined ? { imageId: option.imageId } : {}),
  };
}

function buildReviewQuestion(
  question: AttemptQuestionRecord,
  answer: AttemptAnswerDto | undefined,
): AttemptReviewQuestionDto {
  const selectedIds = answer?.optionIds ?? [];
  const selected = new Set(selectedIds);
  const hasOptions = question.options.length > 0;
  // Отвечено — выбрал вариант или написал непустой текст. Отдельно от
  // optionsCheck ниже: «не отвечено» и «отвечено неверно» неразличимы для
  // проверяющего, если оба дают «0 из 3» (отзыв владельца 2026-09-21).
  const answered = selectedIds.length > 0 || Boolean(answer?.text?.trim());
  return {
    itemId: question.itemId,
    kind: question.kind,
    prompt: question.prompt,
    answerText: answer?.text,
    options: question.options.map((option) => toReviewOption(option, selected)),
    // Считать «сколько верных выбрано» нечему, если выбора не было вовсе —
    // без этого условия неотвеченный вопрос с вариантами показывал «0 из N»,
    // неотличимо от честно неверного ответа.
    optionsCheck:
      hasOptions && answered
        ? checkOptionAnswer(question.options, selectedIds)
        : undefined,
    answered,
  };
}

export function buildReviewBlocks(
  blocks: readonly AttemptBlockRecord[],
  answers: readonly AttemptAnswerDto[],
): AttemptReviewBlockDto[] {
  const answerByItemId = new Map(answers.map((answer) => [answer.itemId, answer]));
  return blocks.map((block) => ({
    id: block.id,
    title: block.title,
    questions: block.questions.map((question) =>
      buildReviewQuestion(question, answerByItemId.get(question.itemId)),
    ),
  }));
}
