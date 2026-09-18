// Поля страницы материала — вынесены из MaterialEditorForm (CLAUDE.md
// «Файлы»). Вид материала — переключателями, тот же приём, что у
// exam-items/ExamItemKindField.tsx (значений всего четыре, по подписи не
// видно, что за материал — переключатель с подписью нагляднее select).
// В отличие от вопроса, вид материала можно поменять и при правке
// (UpdateMaterialInput его принимает, ADR-0047) — переключатель всегда
// активен, ветки «зафиксирован» здесь нет.
import type { CSSProperties } from 'react';
import {
  MATERIAL_KINDS,
  MATERIAL_KIND_LABELS,
  MATERIAL_LIMITS,
  type ClassDto,
} from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import { MaterialClassesField } from './MaterialClassesField';
import type { MaterialFormError, MaterialFormState } from './materialFormInput';

const KIND_LEGEND = 'Вид материала';
const KIND_RADIO_GROUP_NAME = 'material-kind';
const PAID_LABEL = 'Открывать только после оплаты';
// ADR-0048, VOICE.md: говорим про сегодняшний день, а не про планы. Отметка
// сама по себе ничего не закрывает — её включает рубильник школы, которого
// на экранах пока нет.
const PAID_HINT =
  'Пока школа не включила доступ по оплате, такой материал видят все. Отметка сохранится и сработает, когда включит.';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };

function errorFor(
  error: MaterialFormError | null,
  field: MaterialFormError['field'],
): string | undefined {
  return error?.field === field ? error.message : undefined;
}

interface MaterialFormFieldsProps {
  state: MaterialFormState;
  setField: <K extends keyof MaterialFormState>(
    key: K,
    value: MaterialFormState[K],
  ) => void;
  error: MaterialFormError | null;
  classes: ClassDto[];
}

export function MaterialFormFields({
  state,
  setField,
  error,
  classes,
}: MaterialFormFieldsProps) {
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

      <Field
        label="Ссылка"
        hint="Адрес книги, статьи, видео или документа — файлы кабинет не хранит"
        error={errorFor(error, 'url')}
      >
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

      <MaterialClassesField
        classes={classes}
        selectedIds={state.classIds}
        onChange={(classIds) => setField('classIds', classIds)}
      />

      <Toggle
        label={PAID_LABEL}
        hint={PAID_HINT}
        checked={state.paid}
        onChange={(paid) => setField('paid', paid)}
      />
    </>
  );
}
