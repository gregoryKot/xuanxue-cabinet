// Базовые поля формы — название, описание, уровень, лимит времени, число
// попыток (ТЗ 4.3, «Лист»). По образцу exam-items/ExamItemFormFields.tsx.
import type { CSSProperties } from 'react';
import { EXAM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ExamFormState } from './examFormInput';

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 90, resize: 'vertical' };

interface ExamFormFieldsProps {
  state: ExamFormState;
  setField: <K extends keyof ExamFormState>(key: K, value: ExamFormState[K]) => void;
  /** Общая ошибка формы — под первым содержательным полем (название), как в
   * ExamItemFormFields.tsx. */
  error: string | null;
}

export function ExamFormFields({ state, setField, error }: ExamFormFieldsProps) {
  return (
    <>
      <Field label="Название" error={error ?? undefined}>
        <input
          style={inputStyle}
          maxLength={EXAM_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <Field label="Описание" hint="Что это за экзамен — ученик увидит этот текст">
        <textarea
          style={textareaStyle}
          maxLength={EXAM_LIMITS.description}
          value={state.description}
          onChange={(e) => setField('description', e.target.value)}
        />
      </Field>

      <Field
        label="Уровень"
        hint="Например, «начальный». Пусто — форма доступна всем уровням"
      >
        <input
          style={inputStyle}
          maxLength={EXAM_LIMITS.level}
          value={state.level}
          onChange={(e) => setField('level', e.target.value)}
        />
      </Field>

      <Field label="Лимит времени, минут" hint="Пусто — без ограничения">
        <input
          style={inputStyle}
          inputMode="numeric"
          value={state.timeLimitMinText}
          onChange={(e) => setField('timeLimitMinText', e.target.value)}
        />
      </Field>

      <Field label="Число попыток">
        <input
          style={inputStyle}
          inputMode="numeric"
          value={state.attemptsAllowedText}
          onChange={(e) => setField('attemptsAllowedText', e.target.value)}
        />
      </Field>
    </>
  );
}
