// Подсказка по плейсхолдерам — allow-list из shared/src/templates.ts как
// чипы (docs/PLAN.md §6 «Шаблоны»): учитель видит, что вообще можно вписать
// в фигурных скобках, без похода в документацию.
import type { CSSProperties } from 'react';
import { TEMPLATE_PLACEHOLDERS } from '@xuanxue/shared';

const rowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6 };
const chipStyle: CSSProperties = {
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  fontSize: 12,
  color: 'var(--ink-soft)',
};

export function PlaceholderChips() {
  return (
    <div style={rowStyle}>
      {TEMPLATE_PLACEHOLDERS.map((name) => (
        <span key={name} style={chipStyle}>
          {`{${name}}`}
        </span>
      ))}
    </div>
  );
}
