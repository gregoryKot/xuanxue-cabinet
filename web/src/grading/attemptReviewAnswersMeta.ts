// Строка-счётчик под заголовком «Ответы» (Review.dc.html) — сколько всего
// вопросов и сколько из них машина проверила сама (вопрос с вариантами),
// а сколько смотрит учитель (текст, видео — без автопроверки). Оба числа —
// из уже загруженного снимка попытки, не новый запрос. Пустая попытка —
// честный текст, не «0 вопросов» (CLAUDE.md «Продуктовая фича = число в
// своём разделе»).
import { pluralRu, type AttemptReviewBlockDto } from '@xuanxue/shared';

const QUESTION_FORMS = {
  one: 'вопрос',
  few: 'вопроса',
  many: 'вопросов',
  other: 'вопроса',
};

const NO_QUESTIONS_TEXT = 'В этой попытке пока нет вопросов.';

export function formatAttemptAnswersSummary(blocks: AttemptReviewBlockDto[]): string {
  const questions = blocks.flatMap((block) => block.questions);
  const total = questions.length;
  if (total === 0) return NO_QUESTIONS_TEXT;

  const totalLabel = `${total} ${pluralRu(total, QUESTION_FORMS)}`;
  const autoCount = questions.filter((question) => question.options.length > 0).length;
  const manualCount = total - autoCount;

  if (autoCount === 0) return `${totalLabel} · все проверяете вы`;
  if (manualCount === 0) return `${totalLabel} · все проверила машина`;
  return `${totalLabel} · ${autoCount} проверила машина, ${manualCount} — вы`;
}
