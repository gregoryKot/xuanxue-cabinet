// Строка экзамена в списке — название, служебная строка метаданных, статус
// справа (ТЗ 4.3 «Список», направление «тихо и благородно», docs/adr/0031).
// Стиль строки — components/listCardStyles.ts, тот же, что у строки вопроса
// (ExamItemCard.tsx). Уровень в строке не показан — он редактируется на
// странице экзамена, а в списке места на него у макета не нашлось
// (Main.dc.html).
import type { CSSProperties } from 'react';
import type { ExamDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { formatExamListMeta } from './examCounts';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};
const contentStyle: CSSProperties = { minWidth: 0, flex: 1 };
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md «Доступность»:
// у --ink-faint контраст с бумагой ниже AA, он только для плейсхолдеров).
const statusStyle: CSSProperties = { flexShrink: 0, color: 'var(--ink-soft)' };

interface ExamCardProps {
  exam: ExamDto;
  onSelect: () => void;
}

export function ExamCard({ exam, onSelect }: ExamCardProps) {
  return (
    <li>
      <button type="button" style={listCardStyle} onClick={onSelect}>
        <div style={rowStyle}>
          <div style={contentStyle}>
            <div style={listCardTitleStyle}>{exam.title}</div>
            <div style={listCardMetaStyle}>{formatExamListMeta(exam)}</div>
          </div>
          <span className="xuanxue-status-label" style={statusStyle}>
            {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[exam.status]}
          </span>
        </div>
      </button>
    </li>
  );
}
