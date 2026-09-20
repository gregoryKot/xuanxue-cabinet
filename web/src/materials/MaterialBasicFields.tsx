// Название, ссылка и вид — то, без чего материала не существует. Отдельным
// компонентом, потому что мест ввода стало два: страница материала
// (MaterialFormFields.tsx) и короткая форма «Добавить ссылку» на странице
// даты занятия (planning/NewLessonMaterialForm.tsx, ADR-0056). Второй копии
// этих трёх полей быть не должно (CLAUDE.md «Одна механика — один
// компонент», jscpd).
//
// Вид — переключателями, тот же приём, что у доступа (MaterialAccessField.tsx)
// и у типа ответа вопроса (exam-items/ExamItemKindField.tsx): значений
// четыре, и по подписи в свёрнутом списке не видно, что за материал.
import type { CSSProperties } from 'react';
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, MATERIAL_LIMITS } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import type { MaterialFormError, MaterialFormState } from './materialFormInput';

const KIND_LEGEND = 'Вид материала';
const KIND_RADIO_GROUP_NAME = 'material-kind';
const URL_HINT = 'Адрес книги, статьи, видео или документа — файлы кабинет не хранит';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };

export function errorFor(
  error: MaterialFormError | null,
  field: MaterialFormError['field'],
): string | undefined {
  return error?.field === field ? error.message : undefined;
}

interface MaterialBasicFieldsProps {
  state: MaterialFormState;
  setField: <K extends keyof MaterialFormState>(
    key: K,
    value: MaterialFormState[K],
  ) => void;
  error: MaterialFormError | null;
}

export function MaterialBasicFields({
  state,
  setField,
  error,
}: MaterialBasicFieldsProps) {
  return (
    <>
      <Field label="Название" error={errorFor(error, 'title')}>
        <input
          style={inputStyle}
          maxLength={MATERIAL_LIMITS.title}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <Field label="Ссылка" hint={URL_HINT} error={errorFor(error, 'url')}>
        <input
          type="url"
          style={inputStyle}
          maxLength={MATERIAL_LIMITS.url}
          value={state.url}
          onChange={(e) => setField('url', e.target.value)}
        />
      </Field>

      <fieldset style={fieldsetStyle}>
        <legend style={legendStyle}>{KIND_LEGEND}</legend>
        {MATERIAL_KINDS.map((option) => (
          <Toggle
            key={option}
            name={KIND_RADIO_GROUP_NAME}
            label={MATERIAL_KIND_LABELS[option]}
            checked={state.kind === option}
            onChange={() => setField('kind', option)}
          />
        ))}
      </fieldset>
    </>
  );
}
