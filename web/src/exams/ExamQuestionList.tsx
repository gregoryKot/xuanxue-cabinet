// Выбранные вопросы экзамена — нумерованный список строками (макет
// Form.dc.html). Строку можно раскрыть — под ней содержимое вопроса и
// «Изменить» (ExamQuestionRow.tsx, отзыв владельца 2026-09-27). Здесь —
// только сетка списка и подсказка про ★, сама строка вынесена по файловому
// храповику.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { dividedListStyle } from '../components/listCardStyles';
import { RichText } from '../components/RichText';
import { ExamQuestionRow } from './ExamQuestionRow';

const EMPTY_TEXT = 'Вопросов пока нет — найдите их или заведите новый ниже.';
const emptyStyle: CSSProperties = { margin: 0, color: 'var(--ink-soft)' };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

// ★ видна и нажимается всегда (отзыв владельца 2026-09-27: «не нашёл способа
// сделать вопрос обязательным») — но действует, только пока заполнено
// «Вопросов ученику» (ADR-0082, дополнение): без выборки обязательных нет.
// Отмеченные ★ при этом честно объясняются, а не просто ничего не делают.
const REQUIRED_HINT =
  '★ сработает, когда часть вопросов достаётся по жребию — впишите число в ' +
  '**«Вопросов ученику»**.';

interface ExamQuestionListProps {
  itemIds: string[];
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  requiredIds: string[];
  requiredEnabled: boolean;
  onToggleRequired: (itemId: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onRemove: (itemId: string) => void;
  /** Строка на правке — `null`, если ни одна не открыта. */
  editingId: string | null;
  /** Открыта форма создания или правки другого вопроса — своя «Изменить»
   * прячется (одновременно видна только одна форма). */
  formsOpen: boolean;
  onStartEdit: (itemId: string) => void;
  onCancelEdit: () => void;
  onSaved: (item: ExamItemDto) => void;
}

export function ExamQuestionList({
  itemIds,
  bankItems,
  bankLoading,
  requiredIds,
  requiredEnabled,
  onToggleRequired,
  onMoveUp,
  onMoveDown,
  onRemove,
  editingId,
  formsOpen,
  onStartEdit,
  onCancelEdit,
  onSaved,
}: ExamQuestionListProps) {
  if (itemIds.length === 0) return <p style={emptyStyle}>{EMPTY_TEXT}</p>;

  const anyRequiredMarked = requiredIds.some((id) => itemIds.includes(id));
  const showRequiredHint = !requiredEnabled && anyRequiredMarked;

  return (
    <>
      <ol style={dividedListStyle}>
        {itemIds.map((itemId, index) => {
          const editing = editingId === itemId;
          return (
            <ExamQuestionRow
              key={itemId}
              index={index}
              atFirst={index === 0}
              atLast={index === itemIds.length - 1}
              item={bankItems.find((candidate) => candidate.id === itemId)}
              bankLoading={bankLoading}
              isRequired={requiredIds.includes(itemId)}
              editing={editing}
              editDisabled={formsOpen && !editing}
              onToggleRequired={() => onToggleRequired(itemId)}
              onMoveUp={() => onMoveUp(index)}
              onMoveDown={() => onMoveDown(index)}
              onRemove={() => onRemove(itemId)}
              onStartEdit={() => onStartEdit(itemId)}
              onCancelEdit={onCancelEdit}
              onSaved={onSaved}
            />
          );
        })}
      </ol>
      {showRequiredHint && (
        <p style={hintStyle}>
          <RichText text={REQUIRED_HINT} />
        </p>
      )}
    </>
  );
}
