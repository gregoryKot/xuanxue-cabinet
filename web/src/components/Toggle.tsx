// Переключатель — нативный checkbox (CLAUDE.md «Доступность»): читается
// скринридером и работает с клавиатуры без единого атрибута ARIA, чего не
// гарантирует кастомный «свитч» на <div>. accent-color красит галочку под
// акцентный цвет кабинета, `label` даёт кликабельную область ≥44px высотой.
import type { CSSProperties } from 'react';

const wrapStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 44,
  cursor: 'pointer',
};

const inputStyle: CSSProperties = {
  width: 22,
  height: 22,
  accentColor: 'var(--accent)',
  flexShrink: 0,
};

interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps) {
  return (
    <label style={wrapStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={inputStyle}
      />
      <span>{label}</span>
    </label>
  );
}
