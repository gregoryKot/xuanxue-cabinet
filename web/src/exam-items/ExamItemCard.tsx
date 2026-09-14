// Карточка вопроса в списке — формулировка (обрезанная CSS-клампом, если
// длинная, ТЗ 4.2 «Что должен увидеть учитель»), тип, статус, теги, номер
// версии, если он больше 1. <button>, не <div onClick> (CLAUDE.md
// «Доступность»), стиль — общий components/listCardStyles.ts. Статистика
// (ТЗ 4.8) — по нажатию отдельной кнопки «Статистика», не при открытии
// карточки: числа не нужны при каждом взгляде на список, ExamItemStats.tsx
// монтируется и грузит их только когда развёрнута.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU, EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';
import { ExamItemStats } from './ExamItemStats';

const PROMPT_MAX_LINES = 2;

const promptStyle: CSSProperties = {
  ...listCardTitleStyle,
  display: '-webkit-box',
  WebkitLineClamp: PROMPT_MAX_LINES,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

// Отдельная кнопка, не часть listCardStyle: она не открывает лист правки, а
// переключает статистику внутри той же карточки (вложенные <button> внутри
// <button> недопустимы в HTML — оба живут как соседи в <li>).
const statsToggleStyle: CSSProperties = {
  display: 'block',
  marginTop: 6,
  padding: '4px 0',
  border: 'none',
  background: 'none',
  color: 'var(--accent)',
  font: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
  minHeight: 44,
};

interface ExamItemCardProps {
  item: ExamItemDto;
  onSelect: () => void;
}

export function ExamItemCard({ item, onSelect }: ExamItemCardProps) {
  const [statsOpen, setStatsOpen] = useState(false);

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
      <button
        type="button"
        style={statsToggleStyle}
        aria-expanded={statsOpen}
        onClick={() => setStatsOpen((open) => !open)}
      >
        {statsOpen ? 'Скрыть статистику' : 'Статистика'}
      </button>
      {statsOpen && <ExamItemStats itemId={item.id} />}
    </li>
  );
}
