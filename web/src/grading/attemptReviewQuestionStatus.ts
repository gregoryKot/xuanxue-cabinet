// Короткая метка статуса вопроса в карточке проверки (Review.dc.html,
// направление «тихо и благородно») — рядом с формулировкой, как статус формы
// на строке списка (exams/ExamCard.tsx, .xuanxue-status-label). Текст машина
// не проверяет — «Смотрите вы». Видео-вопрос теперь отвечает на свой itemId
// (ADR-0037), поэтому у него отдельная тройка меток: медиа этого вопроса нет —
// «Ответа нет» (учитель ждёт, ничего проверять пока не может), загрузка ещё
// идёт (`pendingVideoItemIds` карточки, аудит 2026-10-01 F34) — «Видео
// загружается», пришло — «Есть ответ» (не «Верно»: видео ещё не проверено,
// jade — только для автопроверенного совпадения вариантов). Вопрос без
// ответа (вариант или текст) — «Не отвечено» раньше любой другой ветки:
// «не отвечено» и «отвечено неверно» — разные вещи для проверяющего (отзыв
// владельца 2026-09-21, «0 из 3» стояло и там, и там). С вариантами и
// полным совпадением — «Верно» (нефрит, CLAUDE.md «Правило акцента»: смысл
// «сдал/верно» — только --jade). Частичное совпадение — числом без цвета:
// заливка терракотой уже занята кнопкой отправки оценки, второе красное пятно
// на экране запрещено, поэтому не 2 из 3 в такой же тревожный оттенок, а тушь
// той же силы, что у служебного текста.
import type { AttemptOptionCheckDto, AttemptReviewQuestionDto } from '@xuanxue/shared';

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
const VIDEO_NO_ANSWER_LABEL = 'Ответа нет';
const VIDEO_UPLOADING_LABEL = 'Видео загружается';
const VIDEO_HAS_ANSWER_LABEL = 'Есть ответ';
const NOT_ANSWERED_LABEL = 'Не отвечено';

/** `null` — отвеченный вопрос с вариантами, но без автопроверки: защита в
 * глубину, API такого не присылает (`optionsCheck` считается ровно тогда,
 * когда есть и варианты, и ответ — exam-attempt-review.ts). Рисовать нечего,
 * ничего не выдумываем. `hasMedia` —
 * пришло ли видео этого вопроса (AttemptReviewQuestion сам фильтрует
 * `ExamMediaDto[]` попытки по `itemId`, ADR-0037); `isUploading` — видео
 * этого вопроса ещё грузится (F34). Пришедшее видео сильнее загрузки: вторая
 * запись к тому же вопросу не прячет первую. У вопросов без видео оба
 * значения не имеют. */
export function attemptReviewQuestionStatus(
  question: Pick<
    AttemptReviewQuestionDto,
    'kind' | 'options' | 'optionsCheck' | 'answered'
  >,
  hasMedia = false,
  isUploading = false,
): AttemptReviewQuestionStatus | null {
  if (question.kind === 'video') {
    if (hasMedia) return { label: VIDEO_HAS_ANSWER_LABEL, tone: 'neutral' };
    return isUploading
      ? { label: VIDEO_UPLOADING_LABEL, tone: 'neutral' }
      : { label: VIDEO_NO_ANSWER_LABEL, tone: 'neutral' };
  }
  if (!question.answered) return { label: NOT_ANSWERED_LABEL, tone: 'neutral' };
  if (question.options.length === 0) {
    return { label: MANUAL_REVIEW_LABEL, tone: 'neutral' };
  }
  if (!question.optionsCheck) return null;

  if (isFullyCorrect(question.optionsCheck)) {
    return { label: FULLY_CORRECT_LABEL, tone: 'jade' };
  }
  const { correctSelectedCount, correctTotalCount } = question.optionsCheck;
  return { label: `${correctSelectedCount} из ${correctTotalCount}`, tone: 'neutral' };
}

/** Полное совпадение вариантов — одно определение «верно» и для метки
 * вопроса, и для счётчика над списком (attemptReviewAnswersMeta.ts). */
export function isFullyCorrect(check: AttemptOptionCheckDto): boolean {
  return (
    check.correctSelectedCount === check.correctTotalCount &&
    check.incorrectSelectedCount === 0
  );
}
