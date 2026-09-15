// Короткая метка статуса вопроса в карточке проверки (Review.dc.html,
// направление «тихо и благородно») — рядом с формулировкой, как статус формы
// на строке списка (exams/ExamCard.tsx, .xuanxue-status-label). Вопрос без
// вариантов (текст, видео) машина не проверяет — «Смотрите вы»; с вариантами
// и полным совпадением — «Верно» (нефрит, CLAUDE.md «Правило акцента»:
// смысл «сдал/верно» — только --jade). Частичное совпадение — числом без
// цвета: киноварь уже занята кнопкой отправки оценки, второе красное пятно
// на экране запрещено, поэтому не 2 из 3 в такой же тревожный оттенок, а
// тушь той же силы, что у служебного текста.
import type { AttemptReviewQuestionDto } from '@xuanxue/shared';

// Не экспортируется — снаружи модуля тон читают только через
// `AttemptReviewQuestionStatus.tone`, отдельно тип никому не нужен (иначе
// knip ловит его как неиспользуемый экспорт).
type AttemptReviewQuestionStatusTone = 'jade' | 'neutral';

export interface AttemptReviewQuestionStatus {
  label: string;
  tone: AttemptReviewQuestionStatusTone;
}

const MANUAL_REVIEW_LABEL = 'Смотрите вы';
const FULLY_CORRECT_LABEL = 'Верно';

/** `null` — вопрос с вариантами, но без автопроверки (снимок попытки без
 * `optionsCheck`) — рисовать нечего, ничего не выдумываем. */
export function attemptReviewQuestionStatus(
  question: Pick<AttemptReviewQuestionDto, 'options' | 'optionsCheck'>,
): AttemptReviewQuestionStatus | null {
  if (question.options.length === 0) {
    return { label: MANUAL_REVIEW_LABEL, tone: 'neutral' };
  }
  if (!question.optionsCheck) return null;

  const { correctSelectedCount, correctTotalCount, incorrectSelectedCount } =
    question.optionsCheck;
  const isFullyCorrect =
    correctSelectedCount === correctTotalCount && incorrectSelectedCount === 0;
  if (isFullyCorrect) return { label: FULLY_CORRECT_LABEL, tone: 'jade' };

  return { label: `${correctSelectedCount} из ${correctTotalCount}`, tone: 'neutral' };
}
