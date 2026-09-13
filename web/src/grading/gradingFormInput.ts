// Чистая логика формы оценки — состояние, валидация и сборка тела запроса
// (ТЗ 4.6, п.2), вынесена из GradingForm.tsx, чтобы проверять без React
// (CLAUDE.md «Тесты»), по образцу exams/examFormInput.ts. Баллы хранятся
// строкой (scoreText) — пустое поле иначе мгновенно становится 0, и не видно,
// что критерий ещё не оценён (тот же приём, что timeLimitMinText в
// exams/examFormInput.ts). Сообщение о неверных баллах — общее с сервером,
// invalidScoreMessage (shared/src/exam-grading.ts): один и тот же текст, не
// зависимо от того, поймала ли ошибку форма или ответ API.
import {
  invalidScoreMessage,
  type ExamGradingDto,
  type GradingOutcome,
  type PutGradingInput,
  type RubricCriterionDto,
} from '@xuanxue/shared';

export const GRADING_OUTCOME_LABELS_RU: Record<GradingOutcome, string> = {
  passed: 'Сдал',
  failed: 'Не сдал',
  needs_work: 'Нужно доработать',
};

const MIN_SCORE = 0;
const OUTCOME_NOT_SELECTED_MESSAGE = 'Выберите итог проверки.';
const NO_CRITERIA_MESSAGE =
  'У этого экзамена нет критериев проверки — добавьте их на экране экзамена.';

export interface GradingCriterionFieldState {
  id: string;
  title: string;
  description?: string;
  maxScore: number;
  scoreText: string;
  comment: string;
}

export interface GradingFormState {
  criteria: GradingCriterionFieldState[];
  comment: string;
  outcome: GradingOutcome | '';
}

/** Форма собирается из ТЕКУЩЕЙ рубрики экзамена (`review.rubric`), не из
 * снимка уже выставленной оценки: правка рубрики после проверки не должна
 * тихо потерять новый критерий из формы — сервер тоже берёт `title`/
 * `maxScore` из рубрики (exam-grading-criteria.ts), не из запроса. Готовые
 * баллы и комментарий подставляются по совпадению `id` с уже выставленной
 * оценкой, если она есть. */
export function initialGradingFormState(
  rubric: readonly RubricCriterionDto[],
  grading: ExamGradingDto | undefined,
): GradingFormState {
  const byId = new Map(
    (grading?.criteria ?? []).map((criterion) => [criterion.id, criterion]),
  );
  return {
    criteria: rubric.map((criterion) => {
      const existing = byId.get(criterion.id);
      return {
        id: criterion.id,
        title: criterion.title,
        description: criterion.description,
        maxScore: criterion.maxScore,
        scoreText: existing ? String(existing.score) : '',
        comment: existing?.comment ?? '',
      };
    }),
    comment: grading?.comment ?? '',
    outcome: grading?.outcome ?? '',
  };
}

function isValidScore(text: string, maxScore: number): boolean {
  const value = Number(text);
  return (
    text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= MIN_SCORE &&
    value <= maxScore
  );
}

/** `null` — форма валидна, иначе текст первой найденной ошибки. */
export function validateGradingForm(state: GradingFormState): string | null {
  if (state.criteria.length === 0) return NO_CRITERIA_MESSAGE;
  for (const criterion of state.criteria) {
    if (!isValidScore(criterion.scoreText, criterion.maxScore)) {
      return invalidScoreMessage(criterion.title, criterion.maxScore);
    }
  }
  if (state.outcome === '') return OUTCOME_NOT_SELECTED_MESSAGE;
  return null;
}

/** Зовите только после того, как `validateGradingForm` вернул `null` —
 * `outcome` приводится к `GradingOutcome` без повторной проверки. */
export function toGradingInput(state: GradingFormState): PutGradingInput {
  return {
    criteria: state.criteria.map((criterion) => ({
      id: criterion.id,
      score: Number(criterion.scoreText),
      comment: criterion.comment.trim() || undefined,
    })),
    comment: state.comment.trim() || undefined,
    outcome: state.outcome as GradingOutcome,
  };
}
