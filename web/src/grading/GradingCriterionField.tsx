// Одна строка формы оценки — баллы по критерию рубрики (0..maxScore) и
// необязательный комментарий (ТЗ 4.6, п.2). Баллы — text+inputMode="numeric",
// как timeLimitMinText в exams/examFormInput.ts: пустое поле не становится
// мгновенно «0» и видно, что критерий ещё не оценён.
import type { CSSProperties } from 'react';
import { GRADING_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { GradingCriterionFieldState } from './gradingFormInput';

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 60, resize: 'vertical' };

interface GradingCriterionFieldProps {
  criterion: GradingCriterionFieldState;
  onChange: (next: GradingCriterionFieldState) => void;
}

export function GradingCriterionField({
  criterion,
  onChange,
}: GradingCriterionFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Field
        label={`${criterion.title} — баллы (0–${criterion.maxScore})`}
        hint={criterion.description}
      >
        <input
          style={inputStyle}
          inputMode="numeric"
          value={criterion.scoreText}
          onChange={(e) => onChange({ ...criterion, scoreText: e.target.value })}
        />
      </Field>
      <Field label={`Комментарий к «${criterion.title}»`}>
        <textarea
          style={textareaStyle}
          maxLength={GRADING_LIMITS.criterionComment}
          value={criterion.comment}
          onChange={(e) => onChange({ ...criterion, comment: e.target.value })}
        />
      </Field>
    </div>
  );
}
