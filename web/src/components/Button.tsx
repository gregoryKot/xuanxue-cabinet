// Кнопка действия — одна механика на весь кабинет (CLAUDE.md «Одна механика —
// один компонент»): цель ≥44×44 (CLAUDE.md «Доступность»), `pending` —
// единственное разрешённое место спиннера/занятости (aria-busy, не текст —
// подпись кнопки остаётся видимой и понятной).
import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

const base: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '10px 18px',
  borderRadius: 8,
  border: '1px solid transparent',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--accent-contrast)' },
  secondary: {
    background: 'transparent',
    color: 'var(--accent)',
    borderColor: 'var(--border)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--danger)',
    borderColor: 'var(--danger)',
  },
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  pending?: boolean;
}

export function Button({
  variant = 'primary',
  pending,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      style={{ ...base, ...variants[variant], opacity: pending ? 0.7 : 1, ...style }}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    />
  );
}
