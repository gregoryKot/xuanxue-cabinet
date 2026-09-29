// Подстановки как кнопки — allow-list из shared/src/templates.ts (у постов
// TEMPLATE_PLACEHOLDERS, у напоминания об оплате PAYMENT_REMINDER_PLACEHOLDERS:
// список имён и пояснения приходят пропсами, кнопок один компонент), клик
// вставляет `{имя}` в текст (docs/PLAN.md §6 «Шаблоны»; отзыв владельца
// 2026-09-08 — учитель перепечатывал имена руками вместе со скобками).
// Пояснения — раскрывающимся списком, а не подсказкой по наведению: на
// телефоне наведения нет вовсе, а фокус приходит вместе с нажатием, которое
// уже вставило подстановку в текст, — чтобы узнать смысл, пришлось бы
// вставить и стереть. Список одинаково открывается мышью, пальцем и с
// клавиатуры (CLAUDE.md «Мобильный экран первым», «Доступность»); `title`
// оставлен для десктопной мыши как быстрая подсказка.
import type { CSSProperties } from 'react';

const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const chipStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: '4px 12px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--ink-soft)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
};
// `display: 'flex'` здесь не задаём: у `<summary>` он по умолчанию
// `list-item`, и это то, что рисует системный треугольник раскрытия —
// поставь `flex`, и Chromium с WebKit его убирают, а подпись превращается в
// тихую строку 13px без единого признака, что её можно нажать. Выбор
// проще, чем рисовать свой треугольник и поворачивать его по `[open]` под
// `prefers-reduced-motion`: раскладку и высоту цели нажатия (CLAUDE.md
// «Доступность») даёт вертикальный паддинг — тот же приём, что у
// textLinkHitAreaStyle в screenLayout.ts.
const summaryStyle: CSSProperties = {
  minHeight: 44,
  padding: '10px 0',
  fontSize: 13,
  color: 'var(--ink-soft)',
  cursor: 'pointer',
};
const listStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 13,
};

interface PlaceholderChipsProps<Name extends string> {
  /** Допустимые подстановки — allow-list того шаблона, который правят. */
  names: readonly Name[];
  /** Пояснение к каждой подстановке (placeholderHints.ts). */
  hints: Record<Name, string>;
  /** Заголовок раскрывающегося списка: «Что подставится в пост». */
  summary: string;
  onInsert: (name: Name) => void;
}

export function PlaceholderChips<Name extends string>({
  names,
  hints,
  summary,
  onInsert,
}: PlaceholderChipsProps<Name>) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={rowStyle}>
        {names.map((name) => (
          <button
            key={name}
            type="button"
            style={chipStyle}
            title={hints[name]}
            onClick={() => onInsert(name)}
          >
            {`{${name}}`}
          </button>
        ))}
      </div>

      <details>
        <summary style={summaryStyle}>{summary}</summary>
        <dl style={listStyle}>
          {names.map((name) => (
            <div key={name}>
              <dt style={{ fontWeight: 600 }}>{`{${name}}`}</dt>
              <dd style={{ margin: 0, color: 'var(--ink-soft)' }}>{hints[name]}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
