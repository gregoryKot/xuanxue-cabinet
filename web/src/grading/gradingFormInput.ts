// Чистая логика формы оценки — состояние, валидация и сборка тела запроса
// (ТЗ 4.6, п.2 после удаления рубрики), вынесена из GradingForm.tsx, чтобы
// проверять без React (CLAUDE.md «Тесты»), по образцу exams/examFormInput.ts.
// Рубрика и баллы по критериям удалены с концами (docs/adr/0038): проверка
// теперь — только итог и общий комментарий, форма их просто собирает.
import type { ExamGradingDto, GradingOutcome, PutGradingInput } from '@xuanxue/shared';

export const GRADING_OUTCOME_LABELS_RU: Record<GradingOutcome, string> = {
  passed: 'Сдал',
  failed: 'Не сдал',
  needs_work: 'Нужно доработать',
};

const OUTCOME_NOT_SELECTED_MESSAGE = 'Выберите итог проверки.';

export interface GradingFormState {
  comment: string;
  outcome: GradingOutcome | '';
}

/** Форма собирается из уже выставленной оценки, если она есть — иначе поля
 * пустые и итог не выбран. */
export function initialGradingFormState(
  grading: ExamGradingDto | undefined,
): GradingFormState {
  return {
    comment: grading?.comment ?? '',
    outcome: grading?.outcome ?? '',
  };
}

/** `null` — форма валидна, иначе текст ошибки. */
export function validateGradingForm(state: GradingFormState): string | null {
  if (state.outcome === '') return OUTCOME_NOT_SELECTED_MESSAGE;
  return null;
}

/** Зовите только после того, как `validateGradingForm` вернул `null` —
 * `outcome` приводится к `GradingOutcome` без повторной проверки. */
export function toGradingInput(state: GradingFormState): PutGradingInput {
  return {
    comment: state.comment.trim() || undefined,
    outcome: state.outcome as GradingOutcome,
  };
}
