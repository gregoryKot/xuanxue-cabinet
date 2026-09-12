// Карточка вопроса в списке — формулировка (обрезанная CSS-клампом, если
// длинная, ТЗ 4.2 «Что должен увидеть учитель»), тип, статус, теги, номер
// версии, если он больше 1. <button>, не <div onClick> (CLAUDE.md
// «Доступность»), стиль — общий components/listCardStyles.ts.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU, EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';

const PROMPT_MAX_LINES = 2;

const promptStyle: CSSProperties = {
  ...listCardTitleStyle,
  display: '-webkit-box',
  WebkitLineClamp: PROMPT_MAX_LINES,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

interface ExamItemCardProps {
  item: ExamItemDto;
  onSelect: () => void;
}

export function ExamItemCard({ item, onSelect }: ExamItemCardProps) {
  return (
    <li>
      <button type="button" style={listCardStyle} onClick={onSelect}>
        <div style={promptStyle}>{item.prompt}</div>
        <div style={listCardMetaStyle}>
          {EXAM_ITEM_KIND_LABELS_RU[item.kind]} ·{' '}
          {EXAM_ITEM_STATUS_LABELS_RU[item.status]}
          {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
          {item.version > 1 && ` · версия ${item.version}`}
        </div>
      </button>
    </li>
  );
}
