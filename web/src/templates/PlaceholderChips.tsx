// Подстановки как кнопки — allow-list из shared/src/templates.ts, клик
// вставляет `{имя}` в текст (docs/PLAN.md §6 «Шаблоны»; отзыв владельца
// 2026-09-08 — учитель перепечатывал имена руками вместе со скобками).
// Пояснения — раскрывающимся списком, а не подсказкой по наведению: на
// телефоне наведения нет вовсе, а фокус приходит вместе с нажатием, которое
// уже вставило подстановку в текст, — чтобы узнать смысл, пришлось бы
// вставить и стереть. Список одинаково открывается мышью, пальцем и с
// клавиатуры (CLAUDE.md «Мобильный экран первым», «Доступность»); `title`
// оставлен для десктопной мыши как быстрая подсказка.
import type { CSSProperties } from 'react';
import { TEMPLATE_PLACEHOLDERS, type TemplatePlaceholder } from '@xuanxue/shared';
import { PLACEHOLDER_HINTS } from './placeholderHints';

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
const summaryStyle: CSSProperties = {
  minHeight: 44,
  display: 'flex',
  alignItems: 'center',
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

interface PlaceholderChipsProps {
  onInsert: (name: TemplatePlaceholder) => void;
}

export function PlaceholderChips({ onInsert }: PlaceholderChipsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={rowStyle}>
        {TEMPLATE_PLACEHOLDERS.map((name) => (
          <button
            key={name}
            type="button"
            style={chipStyle}
            title={PLACEHOLDER_HINTS[name]}
            onClick={() => onInsert(name)}
          >
            {`{${name}}`}
          </button>
        ))}
      </div>

      <details>
        <summary style={summaryStyle}>Что подставится в пост</summary>
        <dl style={listStyle}>
          {TEMPLATE_PLACEHOLDERS.map((name) => (
            <div key={name}>
              <dt style={{ fontWeight: 600 }}>{`{${name}}`}</dt>
              <dd style={{ margin: 0, color: 'var(--ink-soft)' }}>
                {PLACEHOLDER_HINTS[name]}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
