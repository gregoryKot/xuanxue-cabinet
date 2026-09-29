// Одно текстовое поле настроек школы со своей кнопкой «Сохранить»: подпись,
// поле, ошибка сервера и кнопка (CLAUDE.md «Одна механика — один компонент»).
// Раньше этот блок копировался в разделы «Контакт для новичков» и «Кто
// отвечает за данные» (jscpd). Значение, «есть ли изменения» и сам PATCH — в
// хуке поля (useSettingsTextField.ts), здесь только разметка.
import { Button } from '../components/Button';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { primaryActionStyle } from '../components/screenLayout';
import type { UseSettingsTextFieldResult } from './useSettingsTextField';

interface SettingsTextFieldProps {
  label: string;
  /** Текст на кнопке: не «Сохранить», а с названием поля — на экране «Шаблоны»
   * такая кнопка уже есть у шаблонов, одинаковые имена неразличимы для
   * скринридера (см. SchoolSiteField.tsx). */
  saveLabel: string;
  maxLength: number;
  field: UseSettingsTextFieldResult;
  hint?: string;
  placeholder?: string;
}

export function SettingsTextField({
  label,
  saveLabel,
  maxLength,
  field,
  hint,
  placeholder,
}: SettingsTextFieldProps) {
  return (
    <>
      <Field label={label} hint={hint}>
        <input
          type="text"
          style={inputStyle}
          placeholder={placeholder}
          maxLength={maxLength}
          value={field.value}
          onChange={(event) => field.setValue(event.target.value)}
        />
      </Field>
      <FormServerError error={field.error} />
      <Button
        variant="secondary"
        style={primaryActionStyle}
        onClick={() => void field.save()}
        pending={field.pending}
        disabled={!field.hasChanges}
      >
        {saveLabel}
      </Button>
    </>
  );
}
