// Одна строка выбранного вопроса — номер, формулировка кнопкой-раскрытием,
// служебная строка, кнопки порядка справа. Раскрытая строка показывает
// содержимое вопроса (ExamQuestionDetails) и «Изменить» — форма правки на
// месте (QuestionInlineForm), отзыв владельца 2026-09-27: «нельзя
// отредактировать вопрос после добавления». Вынесена из ExamQuestionList.tsx
// по файловому храповику — там осталась только сетка списка.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { rowControlStyle } from '../components/listCardStyles';
import { TextLinkButton } from '../components/TextLinkButton';
import { formatExamItemMeta } from '../exam-items/examItemLabels';
import { ExamQuestionDetails } from './ExamQuestionDetails';
import { QuestionInlineForm } from './QuestionInlineForm';

const LOADING_TEXT = 'Загружаем вопросы…';
const MISSING_TEXT = 'Вопрос недоступен — его удалили или спрятали в черновик.';
const REQUIRED_SUFFIX = ' · обязательный';
const REQUIRED_LABEL = 'Обязательный';
const EDIT_LABEL = 'Изменить';

// Номер вопроса — текстовым шрифтом, не антиквой: у Cormorant цифры
// старостильные, и единица в них — голый штрих, неотличимый от римской «I»
// (ровно та причина, по которой ADR-0043 завёл components/StatNumber.tsx).
const numberStyle: CSSProperties = {
  fontSize: 22,
  fontWeight: 500,
  lineHeight: 1,
  color: 'var(--ink-faint)',
  fontVariantNumeric: 'tabular-nums',
  paddingTop: 2,
};
// `<button>` без рамки и заливки — формулировка внутри строки, не отдельная
// кнопка на экране; линии раскрытия не нужно, шеврон дал бы это без слов.
// `minHeight: 44` + центровка по вертикали — цель нажатия пальцем (CLAUDE.md
// «Доступность»), а не голая строка текста высотой в кегль.
const promptButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  minHeight: 44,
  padding: 0,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  fontSize: 16,
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };
// Раскрытое содержимое — во всю ширину строки, не только под формулировкой:
// вторая колонка сетки (номер) сдвинула бы его вправо без этого.
const detailsWrapStyle: CSSProperties = { gridColumn: '1 / -1', marginTop: 4 };
const editLinkRowStyle: CSSProperties = { marginTop: 6 };

interface ExamQuestionRowProps {
  index: number;
  atFirst: boolean;
  atLast: boolean;
  item: ExamItemDto | undefined;
  bankLoading: boolean;
  isRequired: boolean;
  editing: boolean;
  /** Другая форма (новый вопрос или правка соседней строки) уже открыта —
   * своя «Изменить» прячется, чтобы разом было видно не больше одной формы. */
  editDisabled: boolean;
  onToggleRequired: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaved: (item: ExamItemDto) => void;
}

export function ExamQuestionRow({
  index,
  atFirst,
  atLast,
  item,
  bankLoading,
  isRequired,
  editing,
  editDisabled,
  onToggleRequired,
  onMoveUp,
  onMoveDown,
  onRemove,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: ExamQuestionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const showContent = item && (expanded || editing);

  return (
    <li className="xuanxue-question-row">
      <span style={numberStyle}>{index + 1}</span>
      <div>
        <button
          type="button"
          style={promptButtonStyle}
          aria-expanded={Boolean(showContent)}
          onClick={() => setExpanded((value) => !value)}
        >
          {item ? item.prompt : bankLoading ? LOADING_TEXT : MISSING_TEXT}
        </button>
        {item && (
          <div style={metaStyle}>
            {formatExamItemMeta(item)}
            {isRequired && REQUIRED_SUFFIX}
          </div>
        )}
      </div>
      <div className="xuanxue-question-controls">
        <button
          type="button"
          style={{
            ...rowControlStyle,
            color: isRequired ? 'var(--terracotta-text)' : 'var(--ink-soft)',
          }}
          aria-label={REQUIRED_LABEL}
          aria-pressed={isRequired}
          onClick={onToggleRequired}
        >
          {isRequired ? '★' : '☆'}
        </button>
        <button
          type="button"
          style={rowControlStyle}
          aria-label="Выше"
          disabled={atFirst}
          onClick={onMoveUp}
        >
          ↑
        </button>
        <button
          type="button"
          style={rowControlStyle}
          aria-label="Ниже"
          disabled={atLast}
          onClick={onMoveDown}
        >
          ↓
        </button>
        <button
          type="button"
          style={rowControlStyle}
          aria-label="Убрать из экзамена"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      {showContent && item && (
        <div style={detailsWrapStyle}>
          {editing ? (
            <QuestionInlineForm item={item} onSaved={onSaved} onCancel={onCancelEdit} />
          ) : (
            <>
              <ExamQuestionDetails item={item} />
              {!editDisabled && (
                <div style={editLinkRowStyle}>
                  <TextLinkButton onClick={onStartEdit}>{EDIT_LABEL}</TextLinkButton>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
