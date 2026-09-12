// Карточка формы в списке — название, уровень, статус, блоки/вопросы, лимит
// времени (ТЗ 4.3 «Список»). Стиль — components/listCardStyles.ts, тот же,
// что у карточки вопроса (ExamItemCard.tsx). formatDurationRu — общий
// форматтер минут (shared), тот же, что в шаблонах постов.
import type { CSSProperties } from 'react';
import { formatDurationRu, type ExamDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { DRAFT_PUBLISHED_ARCHIVED_LABELS_RU } from '../lib/statusTransitions';
import { formatExamContentSummary } from './examCounts';

const titleStyle: CSSProperties = { ...listCardTitleStyle };

interface ExamCardProps {
  exam: ExamDto;
  onSelect: () => void;
}

export function ExamCard({ exam, onSelect }: ExamCardProps) {
  const timeLimitText = exam.timeLimitMin ? formatDurationRu(exam.timeLimitMin) : null;

  return (
    <li>
      <button type="button" style={listCardStyle} onClick={onSelect}>
        <div style={titleStyle}>{exam.title}</div>
        <div style={listCardMetaStyle}>
          {exam.level && `${exam.level} · `}
          {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[exam.status]} ·{' '}
          {formatExamContentSummary(exam.blocks)}
          {timeLimitText && ` · лимит ${timeLimitText}`}
        </div>
      </button>
    </li>
  );
}
