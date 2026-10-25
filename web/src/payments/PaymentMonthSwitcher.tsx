// «‹ Сентябрь 2026 ›» — шаг по месяцам, по одной кнопке в каждую сторону.
// Месяц считает shiftMonth из shared (строковая арифметика без Date,
// CLAUDE.md «Время»); что «сейчас» — знает сервер, поэтому пока он не назвал
// месяц (`month === null`), шагать не от чего и кнопки закрыты.
import type { CSSProperties } from 'react';
import { formatMonthRu, shiftMonth } from '@xuanxue/shared';

const EMPTY_LABEL = '—';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
};
const labelStyle: CSSProperties = {
  flex: 1,
  textAlign: 'center',
  fontFamily: 'var(--font-display)',
  fontSize: 23,
  fontWeight: 500,
};
const stepStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  border: '1px solid var(--control-border)',
  borderRadius: 'var(--radius-control)',
  background: 'transparent',
  color: 'var(--ink)',
  font: 'inherit',
  fontSize: 20,
  cursor: 'pointer',
};

/** «сентябрь 2026» → «Сентябрь 2026»: месяц из shared со строчной буквы. */
function monthLabel(month: string): string {
  const text = formatMonthRu(month);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

interface PaymentMonthSwitcherProps {
  month: string | null;
  disabled: boolean;
  onSelect: (month: string) => void;
}

export function PaymentMonthSwitcher({
  month,
  disabled,
  onSelect,
}: PaymentMonthSwitcherProps) {
  const isLocked = disabled || month === null;
  const step = (delta: number) => {
    if (month !== null) onSelect(shiftMonth(month, delta));
  };

  return (
    <div style={rowStyle}>
      <button
        type="button"
        style={stepStyle}
        aria-label="Предыдущий месяц"
        disabled={isLocked}
        onClick={() => step(-1)}
      >
        ‹
      </button>
      <span style={labelStyle} aria-live="polite">
        {month === null ? EMPTY_LABEL : monthLabel(month)}
      </span>
      <button
        type="button"
        style={stepStyle}
        aria-label="Следующий месяц"
        disabled={isLocked}
        onClick={() => step(1)}
      >
        ›
      </button>
    </div>
  );
}
