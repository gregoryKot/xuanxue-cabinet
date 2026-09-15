// Переключатель — нативный checkbox (CLAUDE.md «Доступность»): читается
// скринридером и работает с клавиатуры без единого атрибута ARIA, чего не
// гарантирует кастомный «свитч» на <div>. accent-color красит галочку под
// акцентный цвет кабинета, `label` даёт кликабельную область ≥44px высотой.
// `disabled` — на время запроса-мутации (например ChannelCard, ревью п.3):
// повторный клик, пока предыдущий ещё в пути, не шлёт второй запрос.
//
// `hint` — строка объяснения под подписью (настройки прохождения экзамена,
// макет Form.dc.html). Стоит вне <label>, как у Field.tsx: внутри он склеился
// бы с подписью в доступное имя поля («Перемешивать вопросыУ каждого…»), и
// ни скринридер, ни getByLabelText больше не находят контрол по одной подписи.
import type { CSSProperties } from 'react';

const inputStyle: CSSProperties = {
  width: 22,
  height: 22,
  accentColor: 'var(--accent)',
  flexShrink: 0,
};
const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };
// Отступ слева ровно под подписью: ширина галочки плюс зазор между ней и
// текстом — объяснение читается продолжением подписи, а не новым абзацем.
const hintStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  paddingLeft: 32,
  marginTop: -6,
};

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, disabled, onChange }: ToggleProps) {
  const wrapStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  const row = (
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

  if (!hint) return row;
  return (
    <div style={columnStyle}>
      {row}
      <span style={hintStyle}>{hint}</span>
    </div>
  );
}
