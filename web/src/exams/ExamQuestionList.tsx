// Выбранные вопросы экзамена — нумерованный список строками (макет
// Form.dc.html): номер антиквой, формулировка, служебная строка «тип · теги»
// и три тихие кнопки порядка справа. Порядок меняется кнопками, не
// перетаскиванием: drag-n-drop на телефоне и с клавиатуры — отдельная боль.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { rowControlStyle } from '../components/listCardStyles';
import { formatExamItemMeta } from '../exam-items/examItemLabels';

const EMPTY_TEXT = 'Вопросов пока нет — найдите их или заведите новый ниже.';
const LOADING_TEXT = 'Загружаем вопросы…';
const MISSING_TEXT = 'Вопрос недоступен — его удалили или спрятали в черновик.';

const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };
const numberStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 24,
  lineHeight: 1,
  color: 'var(--ink-faint)',
  paddingTop: 2,
};
const promptStyle: CSSProperties = { fontSize: 16 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };
const emptyStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };

interface ExamQuestionListProps {
  itemIds: string[];
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (itemId: string) => void;
}

export function ExamQuestionList({
  itemIds,
  bankItems,
  bankLoading,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ExamQuestionListProps) {
  if (itemIds.length === 0) return <p style={emptyStyle}>{EMPTY_TEXT}</p>;

  return (
    <ol style={listStyle}>
      {itemIds.map((itemId, index) => {
        const item = bankItems.find((candidate) => candidate.id === itemId);
        return (
          <li key={itemId} className="xuanxue-question-row">
            <span style={numberStyle}>{index + 1}</span>
            <div>
              <div style={promptStyle}>
                {item ? item.prompt : bankLoading ? LOADING_TEXT : MISSING_TEXT}
              </div>
              {item && <div style={metaStyle}>{formatExamItemMeta(item)}</div>}
            </div>
            <div className="xuanxue-question-controls">
              <button
                type="button"
                style={rowControlStyle}
                aria-label="Выше"
                disabled={index === 0}
                onClick={() => onMoveUp(index)}
              >
                ↑
              </button>
              <button
                type="button"
                style={rowControlStyle}
                aria-label="Ниже"
                disabled={index === itemIds.length - 1}
                onClick={() => onMoveDown(index)}
              >
                ↓
              </button>
              <button
                type="button"
                style={rowControlStyle}
                aria-label="Убрать из экзамена"
                onClick={() => onRemove(itemId)}
              >
                ×
              </button>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
