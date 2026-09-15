// Блоки формы — добавить/убрать/переименовать блок, вопросы внутри (ТЗ 4.3,
// «Лист»). Правки блоков — чистые функции examBlocksInput.ts, здесь только
// разметка и подключение к состоянию формы.
import type { CSSProperties } from 'react';
import { EXAM_LIMITS, type ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { ExamBlockCard } from './ExamBlockCard';
import {
  addBlock,
  addItemToBlock,
  moveItemDown,
  moveItemUp,
  removeBlock,
  removeItemFromBlock,
  renameBlock,
  setBlockRequired,
  setBlockShuffle,
  usedItemIds,
  type ExamBlockDraft,
} from './examBlocksInput';

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };
const legendStyle: CSSProperties = { fontSize: 15, fontWeight: 600 };

interface ExamBlocksFieldProps {
  blocks: ExamBlockDraft[];
  onChange: (blocks: ExamBlockDraft[]) => void;
  bankItems: ExamItemDto[] | null;
  bankLoading: boolean;
  bankError: string | null;
  onRetryBank: () => void;
  onPublishItem: (itemId: string) => void;
}

export function ExamBlocksField({
  blocks,
  onChange,
  bankItems,
  bankLoading,
  bankError,
  onRetryBank,
  onPublishItem,
}: ExamBlocksFieldProps) {
  const used = usedItemIds(blocks);
  const items = bankItems ?? [];

  return (
    <div style={wrapperStyle}>
      <p style={legendStyle}>Блоки</p>

      {bankError && <LoadErrorBanner message={bankError} onRetry={onRetryBank} />}

      {blocks.map((block, index) => (
        <ExamBlockCard
          key={block.id ?? `new-${index}`}
          block={block}
          index={index}
          bankItems={items}
          bankLoading={bankLoading}
          usedItemIds={used}
          onRename={(title) => onChange(renameBlock(blocks, index, title))}
          onToggleShuffle={(shuffle) => onChange(setBlockShuffle(blocks, index, shuffle))}
          onToggleRequired={(required) =>
            onChange(setBlockRequired(blocks, index, required))
          }
          onRemoveBlock={() => onChange(removeBlock(blocks, index))}
          onAddItem={(itemId) => onChange(addItemToBlock(blocks, index, itemId))}
          onPublishItem={onPublishItem}
          onRemoveItem={(itemId) => onChange(removeItemFromBlock(blocks, index, itemId))}
          onMoveItemUp={(itemIndex) => onChange(moveItemUp(blocks, index, itemIndex))}
          onMoveItemDown={(itemIndex) => onChange(moveItemDown(blocks, index, itemIndex))}
        />
      ))}

      <Button
        type="button"
        variant="secondary"
        disabled={blocks.length >= EXAM_LIMITS.blocksMax}
        onClick={() => onChange(addBlock(blocks))}
      >
        Добавить блок
      </Button>
    </div>
  );
}
