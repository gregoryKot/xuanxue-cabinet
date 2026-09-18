// Список сущностей галочками — общая механика (CLAUDE.md «Одна механика —
// один компонент»): жила только в channels/ChannelPicker.tsx для каналов
// рассылки, а материалы (materials/MaterialClassesField.tsx) выбирают ровно
// тем же приёмом занятия расписания — вынесена сюда, чтобы вторую реализацию
// не пришлось писать (jscpd поймал бы дубль). Домен приносит только свою
// подпись и текст пустого состояния; сама галочка — components/Toggle.tsx.
// `ref` — на сам `fieldset` (`tabIndex={-1}`): форма рассылки фокусирует его
// при ошибке «выберите канал» (pr-k3-fixes.md п.6, broadcastFormInput.ts).
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { Toggle } from './Toggle';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };
const errorStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface CheckboxListOption {
  id: string;
  label: string;
}

interface CheckboxListFieldProps {
  legend: string;
  options: CheckboxListOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  hint?: ReactNode;
  emptyMessage: ReactNode;
  error?: string;
}

export const CheckboxListField = forwardRef<HTMLFieldSetElement, CheckboxListFieldProps>(
  function CheckboxListField(
    { legend, options, selectedIds, onChange, hint, emptyMessage, error },
    ref,
  ) {
    function toggle(id: string, checked: boolean) {
      onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
    }

    return (
      <fieldset ref={ref} tabIndex={-1} style={fieldsetStyle}>
        <legend style={legendStyle}>{legend}</legend>
        {hint}

        {options.length === 0 ? (
          <p style={hintStyle}>{emptyMessage}</p>
        ) : (
          options.map((option) => (
            <Toggle
              key={option.id}
              label={option.label}
              checked={selectedIds.includes(option.id)}
              onChange={(checked) => toggle(option.id, checked)}
            />
          ))
        )}
        {error && (
          <p role="alert" style={errorStyle}>
            {error}
          </p>
        )}
      </fieldset>
    );
  },
);
