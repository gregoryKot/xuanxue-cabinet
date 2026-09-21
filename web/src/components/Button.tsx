// Кнопка действия — одна механика на весь кабинет (CLAUDE.md «Одна механика —
// один компонент»): цель ≥44×44 (CLAUDE.md «Доступность»), `pending` —
// единственное разрешённое место спиннера/занятости (aria-busy, не текст —
// подпись кнопки остаётся видимой и понятной).
//
// Роли различает не только цвет (низкое зрение, чёрно-белая печать): у
// первичной — заливка, у вторичной — контур без заливки, у опасной — нет ни
// заливки, ни контура, только текст. Три разных силуэта, не три оттенка
// одной формы (docs/adr/0031-visual-direction-quiet-and-noble.md, правило
// осталось в силе после ADR-0043).
import type { ButtonHTMLAttributes, CSSProperties } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
type ButtonSize = 'default' | 'large';

const base: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  // Макет задаёт primary 11×20 и secondary 10×18 — с разницей ровно в
  // ширину рамки: у primary её нет, у secondary 1px. Ниже у обоих вариантов
  // единая рамка 1px (прозрачная у заливки), поэтому и паддинг общий —
  // 10×18, как в макете у secondary: так все три силуэта остаются одной
  // высоты и не расходятся на пиксель друг с другом в общем ряду.
  padding: '10px 18px',
  borderRadius: 'var(--radius-control)',
  border: '1px solid transparent',
  font: 'inherit',
  fontWeight: 500,
  cursor: 'pointer',
  // Флекс-ряд ставит спиннер (pending ниже) рядом с подписью и центрирует
  // оба по вертикали; на кнопке без спиннера с одной подписью вид не
  // меняется, поэтому это в base, а не только на pending-ветке.
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const variants: Record<ButtonVariant, CSSProperties> = {
  // Единственное место на экране, где заливка — терракота (правило акцента,
  // CLAUDE.md «Правило проекта»): главное действие экрана.
  primary: { background: 'var(--terracotta)', color: 'var(--terracotta-contrast)' },
  secondary: {
    background: 'transparent',
    color: 'var(--ink)',
    borderColor: 'var(--control-border)',
  },
  danger: {
    background: 'transparent',
    color: 'var(--danger)',
    borderColor: 'transparent',
  },
};

// Экран входа (docs/adr/0043, макет 2d) — единственное место кабинета, где
// кнопка крупнее обычных 44px: это единственное действие экрана, не одна из
// многих на форме. Проп размера, а не вторая кнопка (CLAUDE.md «Одна
// механика — один компонент»): силуэт (variant) и размер независимы.
const sizes: Record<ButtonSize, CSSProperties> = {
  default: {},
  large: { minHeight: 48, padding: '13px 20px' },
};

// currentColor — одно кольцо работает на всех трёх силуэтах (заливка, контур,
// текст) без отдельного цвета под каждый вариант.
const spinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  flexShrink: 0,
  borderRadius: '50%',
  border: '2px solid currentColor',
  borderTopColor: 'transparent',
  animation: 'xuanxue-spin 700ms linear infinite',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pending?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'default',
  pending,
  disabled,
  style,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      style={{
        ...base,
        ...variants[variant],
        ...sizes[size],
        opacity: pending ? 0.7 : 1,
        ...style,
      }}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {/* aria-hidden: занятость уже объявлена aria-busy выше, спиннеру
          второй раз объявлять её скринридеру незачем. */}
      {pending && <span aria-hidden="true" style={spinnerStyle} />}
      {children}
    </button>
  );
}
