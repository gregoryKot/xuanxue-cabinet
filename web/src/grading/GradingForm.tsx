// Форма оценки попытки (ТЗ 4.6, п.2 после удаления рубрики) — комментарий и
// итог. Если оценка уже стоит, форма открывается заполненной ею
// (initialGradingFormState), а кнопка говорит, что оценка переписывается, —
// учитель не должен решить, что жмёт «Сохранить» в пустоту. Без собственного
// заголовка: живёт внутри секции «Проверка» (grading/AttemptReviewScreen.tsx),
// второй заголовок над тем же блоком был бы лишним.
import { useState, type CSSProperties, type FormEvent } from 'react';
import {
  GRADING_LIMITS,
  GRADING_OUTCOMES,
  type ExamGradingDto,
  type PutGradingInput,
} from '@xuanxue/shared';
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError, type FormError } from '../components/FormServerError';
import { Select } from '../components/Select';
import { GradingCommentPresets } from './GradingCommentPresets';
import {
  appendPresetText,
  GRADING_OUTCOME_LABELS_RU,
  initialGradingFormState,
  toGradingInput,
  validateGradingForm,
  type GradingFormState,
} from './gradingFormInput';

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 80, resize: 'vertical' };
const errorStyle: CSSProperties = { margin: 0, color: 'var(--danger)' };

interface GradingFormProps {
  grading: ExamGradingDto | undefined;
  onSubmit: (input: PutGradingInput) => Promise<boolean>;
  saving: boolean;
  saveError: FormError | null;
}

export function GradingForm({ grading, onSubmit, saving, saveError }: GradingFormProps) {
  const [state, setState] = useState<GradingFormState>(() =>
    initialGradingFormState(grading),
  );
  const [validationError, setValidationError] = useState<string | null>(null);

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
      <GradingCommentPresets
        comment={state.comment}
        onInsert={(text) =>
          setState((prev) => ({ ...prev, comment: appendPresetText(prev.comment, text) }))
        }
      />

      <Field label="Комментарий">
        <textarea
          style={textareaStyle}
          maxLength={GRADING_LIMITS.comment}
          value={state.comment}
          onChange={(e) => setState((prev) => ({ ...prev, comment: e.target.value }))}
        />
      </Field>

      <Field label="Итог">
        <Select
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
        </Select>
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
