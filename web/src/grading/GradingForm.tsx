// Форма оценки попытки по рубрике (ТЗ 4.6, п.2) — баллы и комментарий по
// каждому критерию, общий комментарий, итог. Если оценка уже стоит, форма
// открывается заполненной ею (initialGradingFormState), а кнопка говорит,
// что оценка переписывается, — учитель не должен решить, что жмёт «Сохранить»
// в пустоту. Без собственного заголовка: живёт внутри секции «Рубрика»
// (grading/AttemptReviewScreen.tsx), второй заголовок над тем же блоком был
// бы лишним.
import { useState, type CSSProperties, type FormEvent } from 'react';
import {
  GRADING_LIMITS,
  GRADING_OUTCOMES,
  type ExamGradingDto,
  type PutGradingInput,
  type RubricCriterionDto,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError, type FormError } from '../components/FormServerError';
import { GradingCriterionField } from './GradingCriterionField';
import {
  GRADING_OUTCOME_LABELS_RU,
  initialGradingFormState,
  toGradingInput,
  validateGradingForm,
  type GradingFormState,
} from './gradingFormInput';

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical' };
const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };

interface GradingFormProps {
  rubric: RubricCriterionDto[];
  grading: ExamGradingDto | undefined;
  onSubmit: (input: PutGradingInput) => Promise<boolean>;
  saving: boolean;
  saveError: FormError | null;
}

export function GradingForm({
  rubric,
  grading,
  onSubmit,
  saving,
  saveError,
}: GradingFormProps) {
  const [state, setState] = useState<GradingFormState>(() =>
    initialGradingFormState(rubric, grading),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  function updateCriterion(index: number, next: GradingFormState['criteria'][number]) {
    setState((prev) => ({
      ...prev,
      criteria: prev.criteria.map((criterion, i) => (i === index ? next : criterion)),
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateGradingForm(state);
    setValidationError(invalid);
    if (invalid) return;
    await onSubmit(toGradingInput(state));
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      {state.criteria.map((criterion, index) => (
        <GradingCriterionField
          key={criterion.id}
          criterion={criterion}
          onChange={(next) => updateCriterion(index, next)}
        />
      ))}

      <Field label="Общий комментарий">
        <textarea
          style={textareaStyle}
          maxLength={GRADING_LIMITS.comment}
          value={state.comment}
          onChange={(e) => setState((prev) => ({ ...prev, comment: e.target.value }))}
        />
      </Field>

      <Field label="Итог">
        <select
          style={inputStyle}
          value={state.outcome}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              outcome: e.target.value as GradingFormState['outcome'],
            }))
          }
        >
          <option value="">Выберите итог</option>
          {GRADING_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {GRADING_OUTCOME_LABELS_RU[outcome]}
            </option>
          ))}
        </select>
      </Field>

      {validationError && (
        <p role="alert" style={errorStyle}>
          {validationError}
        </p>
      )}
      <FormServerError error={saveError} />

      <Button type="submit" pending={saving}>
        {grading ? 'Переписать оценку' : 'Сохранить оценку'}
      </Button>
    </form>
  );
}
