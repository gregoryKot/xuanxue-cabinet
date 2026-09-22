// Содержательные поля вопроса — формулировка, подсказка ученику, критерии
// проверки и теги. Тип ответа стоит выше отдельным блоком переключателей
// (ExamItemKindField.tsx): он выбирается один раз и потом не меняется, а эти
// четыре поля правятся всегда.
import type { CSSProperties } from 'react';
import { EXAM_ITEM_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { TagsField } from '../components/TagsField';
import { useTagOptions } from '../hooks/useTagOptions';
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
  // Сбой useTagOptions.ts просто оставляет список пустым — без подсказок,
  // но поле работает как обычный текстовый ввод.
  const tagOptions = useTagOptions();

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

      <Field label="Подсказка" hint="Ученик видит её сразу, до ответа">
        <textarea
          style={textareaStyle}
          maxLength={EXAM_ITEM_LIMITS.hint}
          value={state.hint}
          onChange={(e) => setField('hint', e.target.value)}
        />
      </Field>

      <Field
        label="Критерии проверки"
        hint="Только вам — по ним сверяете ответ, ученик их не видит"
      >
        <textarea
          style={textareaStyle}
          maxLength={EXAM_ITEM_LIMITS.criteria}
          value={state.criteria}
          onChange={(e) => setField('criteria', e.target.value)}
        />
      </Field>

      <TagsField
        value={state.tagsText}
        onChange={(value) => setField('tagsText', value)}
        hint={`Через запятую — раздел программы, уровень. До ${EXAM_ITEM_LIMITS.tagsMax}`}
        options={tagOptions}
      />
    </div>
  );
}
