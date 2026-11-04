// Рамка списка выбора — общая для CheckboxListField и RadioListField (CLAUDE.md
// «Одна механика — один компонент»): `fieldset` с `legend`, подсказкой над
// списком и ошибкой под ним. Строки списка кладёт вызывающий компонент.
// `ref` — на сам `fieldset` (`tabIndex={-1}`): форма рассылки фокусирует его при
// ошибке «выберите канал» (broadcastFormInput.ts).
import { forwardRef, type CSSProperties, type ReactNode } from 'react';
import { RichText } from './RichText';

const fieldsetStyle: CSSProperties = {
  border: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};
const legendStyle: CSSProperties = { fontSize: 14, fontWeight: 600, padding: 0 };
export const listFieldHintStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: 'var(--ink-soft)',
};
const errorStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--danger)' };

interface ListFieldFrameProps {
  legend: string;
  hint?: ReactNode;
  error?: string;
  /** Вариантов нет — вместо строк показывается `emptyMessage`. */
  emptyMessage?: ReactNode;
  isEmpty: boolean;
  children: ReactNode;
}

export const ListFieldFrame = forwardRef<HTMLFieldSetElement, ListFieldFrameProps>(
  function ListFieldFrame({ legend, hint, error, emptyMessage, isEmpty, children }, ref) {
    return (
      <fieldset ref={ref} tabIndex={-1} style={fieldsetStyle}>
        <legend style={legendStyle}>{legend}</legend>
        {hint}
        {isEmpty ? <p style={listFieldHintStyle}>{emptyMessage}</p> : children}
        {/* Через RichText (ADR-0124); hint — ReactNode, его рисует вызывающая
         * сторона сама. */}
        {error && (
          <p role="alert" style={errorStyle}>
            <RichText text={error} />
          </p>
        )}
      </fieldset>
    );
  },
);
