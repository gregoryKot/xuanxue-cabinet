// Раздел «Вопросы» страницы редактора (макет Form.dc.html): счётчик в
// подписи-рубрике, нумерованный список выбранных и поиск по банку под ним.
// Правки списка — чистые функции examQuestionList.ts, здесь только связка с
// состоянием формы.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { ExamBankSearch } from './ExamBankSearch';
import { ExamQuestionList } from './ExamQuestionList';
import {
  addQuestion,
  moveQuestionDown,
  moveQuestionUp,
  removeQuestion,
} from './examQuestionList';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

interface ExamQuestionsSectionProps {
  itemIds: string[];
  onChange: (itemIds: string[]) => void;
  bankItems: ExamItemDto[] | null;
  bankLoading: boolean;
  bankError: string | null;
  onRetryBank: () => void;
}

export function ExamQuestionsSection({
  itemIds,
  onChange,
  bankItems,
  bankLoading,
  bankError,
  onRetryBank,
}: ExamQuestionsSectionProps) {
  return (
    <div style={columnStyle}>
      <span className="xuanxue-eyebrow">Вопросы · {itemIds.length}</span>

      <ExamQuestionList
        itemIds={itemIds}
        bankItems={bankItems ?? []}
        bankLoading={bankLoading}
        onMoveUp={(index) => onChange(moveQuestionUp(itemIds, index))}
        onMoveDown={(index) => onChange(moveQuestionDown(itemIds, index))}
        onRemove={(itemId) => onChange(removeQuestion(itemIds, itemId))}
      />

      <ExamBankSearch
        bankItems={bankItems}
        bankLoading={bankLoading}
        bankError={bankError}
        onRetryBank={onRetryBank}
        chosenIds={itemIds}
        onAdd={(itemId) => onChange(addQuestion(itemIds, itemId))}
      />
    </div>
  );
}
