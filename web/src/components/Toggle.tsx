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
//
// `name` переводит переключатель в радио: выбор одного из нескольких (тип
// ответа вопроса, ExamItemKindField.tsx) — та же строка «галочка, подпись,
// объяснение», и взаимное исключение внутри группы браузер делает сам.
//
// Картинка варианта ответа (ADR-0035) здесь больше не рендерится: вариант с
// картинкой стал плиткой (AttemptOptionTile.tsx, docs/adr/0105) — контрол
// стоял отдельной строкой НАД картинкой, и на экране казалось, что галочка
// относится к чужому фото сверху (жалоба владельца со снимком). Toggle
// остался строкой «галочка + подпись» для вариантов без картинок и для
// остальных переключателей кабинета.
//
// Вместе с картинкой ушёл и проп `labelHidden` (спрятать подпись визуально,
// оставив её доступным именем): он существовал ровно ради варианта-картинки
// без своего текста, а тот теперь плитка и прячет «Вариант N» сам. У строки
// без картинки прятать нечего — подпись и есть всё, что видно.
import type { CSSProperties } from 'react';
import { RichText } from './RichText';

const inputStyle: CSSProperties = {
  width: 22,
  height: 22,
  accentColor: 'var(--accent)',
  flexShrink: 0,
};
const rowStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 44,
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
  /** Передано — это радио из группы с таким именем, а не самостоятельная галочка. */
  name?: string;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, hint, checked, disabled, name, onChange }: ToggleProps) {
  const labelStyle: CSSProperties = {
    ...rowStyle,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  };
  const row = (
    <label style={labelStyle}>
      <input
        type={name ? 'radio' : 'checkbox'}
        name={name}
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
      {/* Через RichText (ADR-0124) — акцент в подсказке под переключателем. */}
      <span style={hintStyle}>
        <RichText text={hint} />
      </span>
    </div>
  );
}
