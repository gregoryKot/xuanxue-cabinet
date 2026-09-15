// Один блок формы — название, галочки «перемешивать»/«обязателен», список
// вопросов с порядком, добавление вопроса (ТЗ 4.3, «Лист»).
import { useState, type CSSProperties } from 'react';
import { EXAM_LIMITS, type ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { inputStyle } from '../components/Field';
import { ExamBlockItems } from './ExamBlockItems';
import type { ExamBlockDraft } from './examBlocksInput';
import { ExamItemPicker } from './ExamItemPicker';

const headerStyle: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const checkboxRowStyle: CSSProperties = { display: 'flex', gap: 16, flexWrap: 'wrap' };
const checkboxLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};
const cardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
};

interface ExamBlockCardProps {
  block: ExamBlockDraft;
  index: number;
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  usedItemIds: ReadonlySet<string>;
  onRename: (title: string) => void;
  onToggleShuffle: (shuffle: boolean) => void;
  onToggleRequired: (required: boolean) => void;
  onRemoveBlock: () => void;
  onAddItem: (itemId: string) => void;
  onPublishItem: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItemUp: (itemIndex: number) => void;
  onMoveItemDown: (itemIndex: number) => void;
}

export function ExamBlockCard({
  block,
  index,
  bankItems,
  bankLoading,
  usedItemIds,
  onRename,
  onToggleShuffle,
  onToggleRequired,
  onRemoveBlock,
  onAddItem,
  onPublishItem,
  onRemoveItem,
  onMoveItemUp,
  onMoveItemDown,
}: ExamBlockCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          aria-label={`Название блока ${index + 1}`}
          placeholder="Название блока"
          maxLength={EXAM_LIMITS.blockTitle}
          value={block.title}
          onChange={(e) => onRename(e.target.value)}
        />
        <Button type="button" variant="danger" onClick={onRemoveBlock}>
          Убрать блок
        </Button>
      </div>

      <div style={checkboxRowStyle}>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={block.shuffle}
            onChange={(e) => onToggleShuffle(e.target.checked)}
          />
          Перемешивать вопросы
        </label>
        <label style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={block.required}
            onChange={(e) => onToggleRequired(e.target.checked)}
          />
          Блок обязателен
        </label>
      </div>

      <ExamBlockItems
        itemIds={block.itemIds}
        bankItems={bankItems}
        bankLoading={bankLoading}
        onMoveUp={onMoveItemUp}
        onMoveDown={onMoveItemDown}
        onRemove={onRemoveItem}
      />

      <Button
        type="button"
        variant="secondary"
        disabled={block.itemIds.length >= EXAM_LIMITS.itemsPerBlockMax}
        onClick={() => setPickerOpen((open) => !open)}
      >
        {pickerOpen ? 'Скрыть список вопросов' : 'Добавить вопрос'}
      </Button>

      {pickerOpen && (
        <ExamItemPicker
          bankItems={bankItems}
          bankLoading={bankLoading}
          usedItemIds={usedItemIds}
          onAdd={onAddItem}
          onPublish={onPublishItem}
        />
      )}
    </div>
  );
}
