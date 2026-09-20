// Поля страницы материала — вынесены из MaterialEditorForm (CLAUDE.md
// «Файлы»). Название, ссылка и вид общие с короткой формой на странице даты
// занятия (MaterialBasicFields.tsx, ADR-0056); здесь к ним добавляются
// привязка к занятиям расписания, доступ и теги — то, что спрашивают, когда
// материал заводят как материал библиотеки, а не как ссылку с одного занятия.
import { TAG_LIMITS, type ClassDto } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { MaterialAccessField } from './MaterialAccessField';
import { MaterialBasicFields, errorFor } from './MaterialBasicFields';
import { MaterialClassesField } from './MaterialClassesField';
import type { MaterialFormError, MaterialFormState } from './materialFormInput';
import { useMaterialTagOptions } from './useMaterialTagOptions';

const TAG_OPTIONS_ID = 'material-tag-options';
const TAG_LEGEND = 'Теги';
// ADR-0058: теги — рубрикация, не служебная пометка, и их видит ученик —
// значит, ни имени, ни телефона в тексте тега быть не должно.
const TAG_HINT = `Через запятую: «для старшей», «24 формы» — до ${TAG_LIMITS.perRecord}. Их видит ученик: без имени и телефона.`;

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
  const tagOptions = useMaterialTagOptions();

  return (
    <>
      <MaterialBasicFields state={state} setField={setField} error={error} />

      <MaterialClassesField
        classes={classes}
        selectedIds={state.classIds}
        onChange={(classIds) => setField('classIds', classIds)}
      />

      <MaterialAccessField
        value={state.access}
        onChange={(access) => setField('access', access)}
      />

      <Field label={TAG_LEGEND} hint={TAG_HINT} error={errorFor(error, 'tags')}>
        <input
          style={inputStyle}
          list={TAG_OPTIONS_ID}
          value={state.tagsText}
          onChange={(e) => setField('tagsText', e.target.value)}
        />
        {/* Сбой useMaterialTagOptions.ts просто оставляет список пустым —
            без подсказок, но поле работает как обычный текстовый ввод. */}
        <datalist id={TAG_OPTIONS_ID}>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </Field>
    </>
  );
}
