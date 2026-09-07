// Базовые поля формы занятия — вынесены из ClassSheet, чтобы сам лист не
// разрастался за 150 строк (CLAUDE.md «Файлы»: выноси подкомпоненты).
// leadMinutesText — текст, не число: пустое поле не подменяется нулём
// молча (ревью п.10), проверка диапазона — validateClassForm.
import { CLASS_FORMATS, CLASS_LIMITS, type ClassFormat } from '@xuanxue/shared';
import { Field, inputStyle } from '../components/Field';
import { Toggle } from '../components/Toggle';
import type { ClassFormState } from './classFormInput';
import { CLASS_FORMAT_LABELS_RU } from './classFormatLabels';

interface ClassFormFieldsProps {
  state: ClassFormState;
  setField: <K extends keyof ClassFormState>(key: K, value: ClassFormState[K]) => void;
  error: string | null;
}

export function ClassFormFields({ state, setField, error }: ClassFormFieldsProps) {
  return (
    <>
      <Field label="Название" error={error ?? undefined}>
        <input
          style={inputStyle}
          value={state.title}
          onChange={(e) => setField('title', e.target.value)}
        />
      </Field>

      <Field
        label="Подпись группы"
        hint="Например «средняя группа» — печатается в постах"
      >
        <input
          style={inputStyle}
          value={state.groupLabel}
          onChange={(e) => setField('groupLabel', e.target.value)}
        />
      </Field>

      <Field label="Формат">
        <select
          style={inputStyle}
          value={state.format}
          onChange={(e) => setField('format', e.target.value as ClassFormat)}
        >
          {CLASS_FORMATS.map((format) => (
            <option key={format} value={format}>
              {CLASS_FORMAT_LABELS_RU[format]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ссылка Zoom" hint={`Время в поясе ${state.tz}`}>
        <input
          style={inputStyle}
          value={state.zoomLink}
          onChange={(e) => setField('zoomLink', e.target.value)}
          placeholder="https://…"
        />
      </Field>

      <Field label="Пароль Zoom">
        <input
          style={inputStyle}
          value={state.zoomPassword}
          onChange={(e) => setField('zoomPassword', e.target.value)}
        />
      </Field>

      <Field
        label="За сколько минут слать ссылку"
        hint={`Число от 0 до ${CLASS_LIMITS.leadMinutesMax}`}
      >
        <input
          type="text"
          inputMode="numeric"
          style={inputStyle}
          value={state.leadMinutesText}
          onChange={(e) => setField('leadMinutesText', e.target.value)}
        />
      </Field>

      <Toggle
        label="Занятие активно"
        checked={state.active}
        onChange={(checked) => setField('active', checked)}
      />
    </>
  );
}
