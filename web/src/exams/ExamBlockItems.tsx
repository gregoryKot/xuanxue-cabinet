// Список вопросов внутри блока — порядок кнопками «выше/ниже» (ТЗ 4.3,
// «Лист»: не перетаскиванием — drag-n-drop на телефоне и с клавиатуры отдельная
// боль). Название вопроса — по id из уже загруженного банка (ExamItemPicker
// грузит тот же список).
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { listCardMetaStyle, listCardStyle } from '../components/listCardStyles';
import { EXAM_ITEM_KIND_LABELS_RU } from '../exam-items/examItemLabels';

const LOADING_TEXT = 'Загрузка…';
const MISSING_TEXT = 'Вопрос недоступен — его удалили или ещё не опубликовали.';

const listStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};
const rowStyle: CSSProperties = {
  ...listCardStyle,
  display: 'flex',
  gap: 8,
  cursor: 'default',
};

interface ExamBlockItemsProps {
  itemIds: string[];
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  onMoveUp: (itemIndex: number) => void;
  onMoveDown: (itemIndex: number) => void;
  onRemove: (itemId: string) => void;
}

export function ExamBlockItems({
  itemIds,
  bankItems,
  bankLoading,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ExamBlockItemsProps) {
  if (itemIds.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
        В блоке пока нет вопросов.
      </p>
    );
  }

  return (
    <ul style={listStyle}>
      {itemIds.map((itemId, index) => {
        const item = bankItems.find((candidate) => candidate.id === itemId);
        return (
          <li key={itemId} style={rowStyle}>
            <div style={{ flex: 1 }}>
              <div>{item ? item.prompt : bankLoading ? LOADING_TEXT : MISSING_TEXT}</div>
              {item && (
                <div style={listCardMetaStyle}>{EXAM_ITEM_KIND_LABELS_RU[item.kind]}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <Button
                type="button"
                variant="secondary"
                disabled={index === 0}
                onClick={() => onMoveUp(index)}
              >
                Выше
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={index === itemIds.length - 1}
                onClick={() => onMoveDown(index)}
              >
                Ниже
              </Button>
              <Button type="button" variant="danger" onClick={() => onRemove(itemId)}>
                Убрать
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
