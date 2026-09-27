// Строка-счётчик под заголовком «Ответы» (Review.dc.html) и порядок вопросов
// под ней. Отзыв владельца 2026-09-27: «16 вопросов · 15 проверила машина,
// 1 — вы» ничего не говорит учителю. Ему нужны два факта — сколько верных
// среди вопросов с вариантами (правильный ответ задан заранее) и сколько
// осталось проверить самому, — а ручные вопросы стоят первыми: ради них он и
// открыл попытку. Все числа — из уже загруженного снимка, не новый запрос.
// Пустая попытка — честный текст, не «0 вопросов» (CLAUDE.md «Продуктовая
// фича = число в своём разделе»).
import type { AttemptReviewBlockDto, AttemptReviewQuestionDto } from '@xuanxue/shared';
import { isFullyCorrect } from './attemptReviewQuestionStatus';

const NO_QUESTIONS_TEXT = 'В этой попытке пока нет вопросов.';

/** Вопрос без вариантов (текст, видео) машина не проверяет — смотрит учитель. */
function isManual(question: AttemptReviewQuestionDto): boolean {
  return question.options.length === 0;
}

/** Не отвеченный вопрос с вариантами — не верный: `optionsCheck` у него нет. */
function isCorrect(question: AttemptReviewQuestionDto): boolean {
  return question.optionsCheck !== undefined && isFullyCorrect(question.optionsCheck);
}

export function formatAttemptAnswersSummary(blocks: AttemptReviewBlockDto[]): string {
  const questions = blocks.flatMap((block) => block.questions);
  if (questions.length === 0) return NO_QUESTIONS_TEXT;

  const auto = questions.filter((question) => !isManual(question));
  const manualCount = questions.length - auto.length;
  const correctCount = auto.filter(isCorrect).length;

  if (auto.length === 0) return `Проверить ${manualCount}`;
  const correct = `Верно ${correctCount} из ${auto.length}`;
  return manualCount > 0 ? `${correct} · проверить ${manualCount}` : correct;
}

function manualFirst(questions: AttemptReviewQuestionDto[]): AttemptReviewQuestionDto[] {
  return [...questions.filter(isManual), ...questions.filter((q) => !isManual(q))];
}

/** Ручные вопросы — в начало: внутри блока и сами блоки с ними — раньше блоков
 * без них. Порядок внутри каждой группы — как в снимке попытки. */
export function orderManualFirst(
  blocks: AttemptReviewBlockDto[],
): AttemptReviewBlockDto[] {
  const ordered = blocks.map((block) => ({
    ...block,
    questions: manualFirst(block.questions),
  }));
  const hasManual = (block: AttemptReviewBlockDto) => block.questions.some(isManual);
  return [...ordered.filter(hasManual), ...ordered.filter((block) => !hasManual(block))];
}
