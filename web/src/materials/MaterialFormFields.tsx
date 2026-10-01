// Поля страницы материала — вынесены из MaterialEditorForm (CLAUDE.md
// «Файлы»). Название, ссылка и вид общие с короткой формой на странице даты
// занятия (MaterialBasicFields.tsx, ADR-0056); здесь к ним добавляются
// привязка к занятиям расписания, доступ и теги — то, что спрашивают, когда
// материал заводят как материал библиотеки, а не как ссылку с одного занятия.
import { TAG_LIMITS, type ClassDto } from '@xuanxue/shared';
import { TagsField } from '../components/TagsField';
import { Toggle } from '../components/Toggle';
import { useTagOptions } from '../hooks/useTagOptions';
import { MaterialAccessField } from './MaterialAccessField';
import { MaterialBasicFields, errorFor } from './MaterialBasicFields';
import { MaterialClassesField } from './MaterialClassesField';
import type { MaterialFormError, MaterialFormState } from './materialFormInput';

// ADR-0058: теги — рубрикация, не служебная пометка, и их видит ученик —
// значит, ни имени, ни телефона в тексте тега быть не должно.
const NOTIFY_LABEL = 'Сообщить ученикам';
// ADR-0162: придёт не всем, а тем, кто сам включил вид и кого материал касается
// (занятия, теги) — обещать «всем ученикам» нельзя.
const NOTIFY_HINT =
  'Придёт тем, кто включил **«Новый материал»** в уведомлениях, если материал касается их занятий.';
const TAG_HINT = `Через запятую: «для старшей», «24 формы» — до **${TAG_LIMITS.perRecord}**. Их видит ученик: **без имени и телефона**.`;

interface MaterialFormFieldsProps {
  state: MaterialFormState;
  setField: <K extends keyof MaterialFormState>(
    key: K,
    value: MaterialFormState[K],
  ) => void;
  error: MaterialFormError | null;
  classes: ClassDto[];
  /** Прокинуто в MaterialBasicFields.tsx как есть (ADR-0134) — знание «когда
   * ссылка необязательна, скажи об этом» держит один файл, не двоится. */
  urlOptional?: boolean;
  /** Материал создаётся, а не правится: объявить можно только при создании
   * (ADR-0162), у существующего галочки нет. */
  canNotifyStudents?: boolean;
}

export function MaterialFormFields({
  state,
  setField,
  error,
  classes,
  urlOptional,
  canNotifyStudents,
}: MaterialFormFieldsProps) {
  // Сбой useTagOptions.ts просто оставляет список пустым — без подсказок,
  // но поле работает как обычный текстовый ввод.
  const tagOptions = useTagOptions();

  return (
    <>
      <MaterialBasicFields
        state={state}
        setField={setField}
        error={error}
        urlOptional={urlOptional}
      />

      <MaterialClassesField
        classes={classes}
        selectedIds={state.classIds}
        onChange={(classIds) => setField('classIds', classIds)}
      />

      <MaterialAccessField
        value={state.access}
        onChange={(access) => setField('access', access)}
      />

      {/* Служебный материал ученик не увидит — сообщать о нём нечего. */}
      {canNotifyStudents && state.access === 'all' && (
        <Toggle
          label={NOTIFY_LABEL}
          hint={NOTIFY_HINT}
          checked={state.notifyStudents}
          onChange={(checked) => setField('notifyStudents', checked)}
        />
      )}

      <TagsField
        value={state.tagsText}
        onChange={(value) => setField('tagsText', value)}
        hint={TAG_HINT}
        options={tagOptions}
        error={errorFor(error, 'tags')}
      />
    </>
  );
}
