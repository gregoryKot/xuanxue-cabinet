// Содержательное поле вопроса — формулировка. Тип ответа стоит выше
// отдельным блоком переключателей (ExamItemKindField.tsx): он выбирается один
// раз и потом не меняется. Подсказка ученику, критерии проверки и теги убраны
// из вопроса вместе с полями (ADR-0128).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ExamItemFormState } from './examItemFormInput';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 90, resize: 'vertical' };

interface ExamItemFormFieldsProps {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  /** Общая ошибка формы — как в ExamAboutFields.tsx, показывается под первым
   * содержательным полем (формулировка), не под каждым отдельно. */
  error: string | null;
}

export function ExamItemFormFields({ state, setField, error }: ExamItemFormFieldsProps) {
  return (
    <div style={columnStyle}>
      <Field label="Формулировка" error={error ?? undefined}>
        <textarea
          style={textareaStyle}
          maxLength={EXAM_ITEM_LIMITS.prompt}
          value={state.prompt}
          onChange={(e) => setField('prompt', e.target.value)}
        />
      </Field>
    </div>
  );
}
