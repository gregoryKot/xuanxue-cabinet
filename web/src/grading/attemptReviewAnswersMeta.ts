// Строка-счётчик под заголовком «Ответы» (Review.dc.html) — сколько всего
// вопросов, сколько из них без ответа (отзыв владельца 2026-09-21: учитель
// должен видеть это по факту, не вычислять из карточек ниже) и сколько из
// отвеченных машина проверила сама (вопрос с вариантами), а сколько смотрит
// учитель (текст, видео — без автопроверки). Все числа — из уже загруженного
// снимка попытки, не новый запрос. Пустая попытка — честный текст, не
// «0 вопросов» (CLAUDE.md «Продуктовая фича = число в своём разделе»).
import {
  pluralRu,
  type AttemptReviewBlockDto,
  type AttemptReviewQuestionDto,
} from '@xuanxue/shared';

const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

const NO_QUESTIONS_TEXT = 'В этой попытке пока нет вопросов.';
// Без склонений (ТЗ) — «без ответа» звучит одинаково при любом числе.
const NO_ANSWER_SUFFIX = 'без ответа';

/** Честно только там, где ответ вообще мог лежать в `answers` попытки — у
 * видео-вопроса `answered` ничего не знает про присланную запись (ADR-0037,
 * ответ там — media, не answers), поэтому видео в счёт не идёт. */
function countUnanswered(questions: AttemptReviewQuestionDto[]): number {
  return questions.filter((question) => question.kind !== 'video' && !question.answered)
    .length;
}

function gradingSegment(autoCount: number, manualCount: number): string {
  if (autoCount === 0) return 'все проверяете вы';
  if (manualCount === 0) return 'все проверила машина';
  return `${autoCount} проверила машина, ${manualCount} — вы`;
}

export function formatAttemptAnswersSummary(blocks: AttemptReviewBlockDto[]): string {
  const questions = blocks.flatMap((block) => block.questions);
  const total = questions.length;
  if (total === 0) return NO_QUESTIONS_TEXT;

  const totalLabel = `${total} ${pluralRu(total, QUESTION_FORMS)}`;
  const autoCount = questions.filter((question) => question.options.length > 0).length;
  const manualCount = total - autoCount;
  const unansweredCount = countUnanswered(questions);

  const segments = [
    totalLabel,
    unansweredCount > 0 ? `${unansweredCount} ${NO_ANSWER_SUFFIX}` : '',
    gradingSegment(autoCount, manualCount),
  ].filter(Boolean);
  return segments.join(' · ');
}
