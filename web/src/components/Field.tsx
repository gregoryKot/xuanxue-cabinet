// Единая обёртка поля формы (CLAUDE.md «Одна механика — один компонент»):
// <label> связывает подпись с полем неявно — без useId/htmlFor, надёжнее
// (не ломается при копипасте формы) и меньше кода. inputStyle — общий стиль
// инпутов/селектов для всех форм кабинета, высота ≥44px (CLAUDE.md «Доступность»).
import type { CSSProperties, ReactNode } from 'react';

export const inputStyle: CSSProperties = {
  minHeight: 44,
  padding: '10px 12px',
  borderRadius: 3,
  // Приглушённая рамка контролов (не --line — та для разделителей/рамок
  // карточек, тут нужнее чуть заметнее): поле стоит на белом, страница —
  // на тёплой бумаге почти того же тона, боковую рамку не заменить фоном.
  border: '1px solid var(--control-border)',
  font: 'inherit',
  background: '#fff',
  color: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
};

const fieldStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelTextStyle: CSSProperties = { fontSize: 14, fontWeight: 600 };
const hintStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
const errorStyle: CSSProperties = { fontSize: 13, color: 'var(--danger)' };

interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  // hint/error — вне <label>: текст подсказки внутри label иначе склеивается
  // в доступное имя поля («Подпись группыНапример…»), и getByLabelText
  // (точный текст) в тестах и скринридерах перестаёт находить поле по одной
  // подписи.
  return (
    <div style={fieldStyle}>
      <label style={fieldStyle}>
        <span style={labelTextStyle}>{label}</span>
        {children}
      </label>
      {error ? (
        <span style={errorStyle} role="alert">
          {error}
        </span>
      ) : hint ? (
        <span style={hintStyle}>{hint}</span>
      ) : null}
    </div>
  );
}
