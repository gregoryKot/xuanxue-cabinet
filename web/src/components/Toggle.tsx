// Переключатель — нативный checkbox (CLAUDE.md «Доступность»): читается
// скринридером и работает с клавиатуры без единого атрибута ARIA, чего не
// гарантирует кастомный «свитч» на <div>. accent-color красит галочку под
// акцентный цвет кабинета, `label` даёт кликабельную область ≥44px высотой.
// `disabled` — на время запроса-мутации (например ChannelCard, ревью п.3):
// повторный клик, пока предыдущий ещё в пути, не шлёт второй запрос.
import type { CSSProperties } from 'react';

const inputStyle: CSSProperties = {
  width: 22,
  height: 22,
  accentColor: 'var(--accent)',
  flexShrink: 0,
};

interface ToggleProps {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, checked, disabled, onChange }: ToggleProps) {
  const wrapStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  return (
    <label style={wrapStyle}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        style={inputStyle}
      />
      <span>{label}</span>
    </label>
  );
}
