// Строка тега в общем списке школы (экран тега, ADR-0075/0078) — тег и два
// числа (даты занятий, материалы, tagSummaryMeta.ts), выбор тега открывает
// разделы ниже (MaterialsTagsScreen.tsx). Тот же приём строки списка, что у
// MaterialCard.tsx/exam-items/ExamItemCard.tsx: <button>, не <a> — выбор
// остаётся на этом экране и меняет только query-параметр, а не адрес
// страницы (CLAUDE.md «Доступность»: семантика по роли действия).
import type { CSSProperties } from 'react';
import type { TagSummaryDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { formatTagSummaryMeta } from './tagSummaryMeta';

const rowButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
// Выбранный тег — заливка --surface (та же подложка, что у Skeleton.tsx):
// заметно темнее белой карточки строки, не сливается с ней.
const selectedRowButtonStyle: CSSProperties = {
  ...rowButtonStyle,
  background: 'var(--surface)',
};

interface TagSummaryRowProps {
  summary: TagSummaryDto;
  selected: boolean;
  onSelect: () => void;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (MaterialsTagsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function TagSummaryRow({
  summary,
  selected,
  onSelect,
  isLast = false,
}: TagSummaryRowProps) {
  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button
        type="button"
        style={selected ? selectedRowButtonStyle : rowButtonStyle}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div style={listCardTitleStyle}>{summary.tag}</div>
        <div style={listCardMetaStyle}>{formatTagSummaryMeta(summary)}</div>
      </button>
    </li>
  );
}
