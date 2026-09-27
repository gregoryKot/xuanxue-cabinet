// Строка вопроса в списке — формулировка (обрезанная CSS-клампом, если
// длинная), под ней тип, статус и номер версии, если он больше 1.
// Список вопросов теперь одна карточка (обёртка — ExamItemsScreen.tsx):
// пять карточек вплотную давали зазубренные углы и швы между ними (отзыв
// владельца по снимку «Вопросов», docs/adr/0043) — строка больше не несёт
// свой фон, радиус и тень, только паддинг и волосяную линию снизу, тот же
// приём, что у ExamCard.tsx; у последней строки (`isLast`) линии нет.
// <button>, не <div onClick> (CLAUDE.md «Доступность»). Статистика (ТЗ 4.8)
// живёт на странице вопроса разделом «Как отвечают», не кнопкой внутри
// строки: числа не нужны при каждом взгляде на список, а вторая кнопка в
// строке ломала её как список (ADR-0033, макет Main.dc.html).
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardTitleStyle } from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU, EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';

const PROMPT_MAX_LINES = 2;

// `<button>` приносит свою рамку и фон — без явного сброса строка выглядела
// бы обведённой поверх общей карточки списка (тот же баг, что и до
// ADR-0031, снимок редактора 2026-09-15, components/listCardStyles.ts).
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
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (ExamItemsScreen.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function ExamItemCard({ item, onSelect, isLast = false }: ExamItemCardProps) {
  return (
    <li style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <button type="button" style={rowButtonStyle} onClick={onSelect}>
        <div style={promptStyle}>{item.prompt}</div>
        <div style={listCardMetaStyle}>
          {EXAM_ITEM_KIND_LABELS_RU[item.kind]} ·{' '}
          {EXAM_ITEM_STATUS_LABELS_RU[item.status]}
          {item.version > 1 && ` · версия ${item.version}`}
        </div>
      </button>
    </li>
  );
}
