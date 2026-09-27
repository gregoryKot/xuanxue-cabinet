// Строка кандидата поиска — формулировка кнопкой-раскрытием, служебная
// строка, «Добавить» справа; раскрытая строка показывает варианты
// (ExamQuestionDetails) — можно посмотреть содержимое ДО того, как вопрос
// попал в экзамен (отзыв владельца 2026-09-27: «нельзя даже посмотреть,
// какие там варианты»). Вынесена из ExamQuestionSearch.tsx по файловому
// храповику.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatExamItemMeta } from '../exam-items/examItemLabels';
import { ExamQuestionDetails } from './ExamQuestionDetails';

const ADD_LABEL = 'Добавить';

const itemStyle: CSSProperties = {
  padding: '10px 0',
  borderBottom: '1px solid var(--line)',
};
const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
};
// Без `minWidth: 0` потомок не сжимается уже своего содержимого, и длинный
// вопрос раздвигал бы строку в горизонтальный скролл (CLAUDE.md «Мобильный
// экран первым»). `anywhere` — колонка может стать уже самого длинного
// слова.
const promptColumnStyle: CSSProperties = {
  minWidth: 0,
  flex: 1,
  overflowWrap: 'anywhere',
};
// Служебная строка — вне кнопки: иначе её текст вошёл бы в доступное имя
// кнопки вместе с формулировкой. `minHeight: 44` + центровка — цель нажатия
// пальцем (CLAUDE.md «Доступность»).
const promptButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };
const detailsWrapStyle: CSSProperties = { marginTop: 8 };

interface ExamQuestionSearchRowProps {
  item: ExamItemDto;
  onAdd: () => void;
}

export function ExamQuestionSearchRow({ item, onAdd }: ExamQuestionSearchRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li style={itemStyle}>
      <div style={rowStyle}>
        <div style={promptColumnStyle}>
          <button
            type="button"
            style={promptButtonStyle}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {item.prompt}
          </button>
          <div style={metaStyle}>{formatExamItemMeta(item)}</div>
        </div>
        <TextLinkButton onClick={onAdd}>{ADD_LABEL}</TextLinkButton>
      </div>
      {expanded && (
        <div style={detailsWrapStyle}>
          <ExamQuestionDetails item={item} />
        </div>
      )}
    </li>
  );
}
