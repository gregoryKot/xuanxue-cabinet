// Базовые поля вопроса — формулировка, подсказка, критерии, тип, теги.
// Тип выбирается только при создании (UpdateExamItemInput его не принимает,
// ТЗ 4.2 п.1) — смена типа значит завести новый вопрос; при правке показан
// текстом с объяснением, не молчанием (по образцу ChannelFormFields.tsx —
// тип канала там тоже фиксируется после создания).
import type { CSSProperties } from 'react';
import { EXAM_ITEM_KINDS, EXAM_ITEM_LIMITS, type ExamItemKind } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import type { ExamItemFormState } from './examItemFormInput';
import { EXAM_ITEM_KIND_LABELS_RU } from './examItemLabels';

const textareaStyle: CSSProperties = { ...inputStyle, minHeight: 90, resize: 'vertical' };
const kindNoteStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface ExamItemFormFieldsProps {
  state: ExamItemFormState;
  setField: <K extends keyof ExamItemFormState>(
    key: K,
    value: ExamItemFormState[K],
  ) => void;
  /** Общая ошибка формы — как в ClassFormFields.tsx, показывается под первым
   * содержательным полем (формулировка), не под каждым отдельно. */
  error: string | null;
  isCreate: boolean;
}

export function ExamItemFormFields({
  state,
  setField,
  error,
  isCreate,
}: ExamItemFormFieldsProps) {
  return (
    <>
      {isCreate ? (
        <Field
          label="Тип вопроса"
          hint="После сохранения его не сменить — для другого формата заведите новый вопрос"
        >
          <select
            style={inputStyle}
            value={state.kind}
            onChange={(e) => setField('kind', e.target.value as ExamItemKind)}
          >
            {EXAM_ITEM_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {EXAM_ITEM_KIND_LABELS_RU[kind]}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <p style={kindNoteStyle}>
          Тип: {EXAM_ITEM_KIND_LABELS_RU[state.kind]} — чтобы изменить, заведите новый
          вопрос
        </p>
      )}

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

      <Field
        label="Теги"
        hint={`Через запятую — раздел программы, уровень. До ${EXAM_ITEM_LIMITS.tagsMax}`}
      >
        <input
          style={inputStyle}
          value={state.tagsText}
          onChange={(e) => setField('tagsText', e.target.value)}
        />
      </Field>
    </>
  );
}
