// Раздел «Вопросы» страницы редактора (макет Form.dc.html): счётчик в
// подписи-рубрике, нумерованный список выбранных и поиск под ним. Рядом с
// поиском — «Новый вопрос» (ADR-0040): владелец просил заводить вопрос там,
// где он нужен, не уходить в «Вопросы» и обратно. Созданный вопрос добавлен
// в `createdItems`, чтобы список выбранных сразу увидел его формулировку —
// второго запроса за списком вопросов не нужно (examQuestions.mergeCreatedItems).
// Правки порядка — чистые функции examQuestions.ts, здесь только связка с
// состоянием формы.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ExamQuestionList } from './ExamQuestionList';
import { ExamQuestionSearch } from './ExamQuestionSearch';
import { NewQuestionForm } from './NewQuestionForm';
import {
  addQuestion,
  mergeCreatedItems,
  moveQuestionDown,
  moveQuestionUp,
  removeQuestion,
} from './examQuestions';

const columnStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 14 };

const NEW_QUESTION_LABEL = 'Новый вопрос';

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
  const [creating, setCreating] = useState(false);
  const [createdItems, setCreatedItems] = useState<ExamItemDto[]>([]);
  const listItems = mergeCreatedItems(bankItems ?? [], createdItems);

  function handleCreated(item: ExamItemDto) {
    setCreatedItems((prev) => mergeCreatedItems(prev, [item]));
    onChange(addQuestion(itemIds, item.id));
    setCreating(false);
  }

  return (
    <div style={columnStyle}>
      <span className="xuanxue-eyebrow">Вопросы · {itemIds.length}</span>

      <ExamQuestionList
        itemIds={itemIds}
        bankItems={listItems}
        bankLoading={bankLoading}
        onMoveUp={(index) => onChange(moveQuestionUp(itemIds, index))}
        onMoveDown={(index) => onChange(moveQuestionDown(itemIds, index))}
        onRemove={(itemId) => onChange(removeQuestion(itemIds, itemId))}
      />

      {creating ? (
        <NewQuestionForm onCreated={handleCreated} onCancel={() => setCreating(false)} />
      ) : (
        <>
          <Button variant="secondary" onClick={() => setCreating(true)}>
            {NEW_QUESTION_LABEL}
          </Button>

          <ExamQuestionSearch
            bankItems={bankItems}
            bankLoading={bankLoading}
            bankError={bankError}
            onRetryBank={onRetryBank}
            chosenIds={itemIds}
            onAdd={(itemId) => onChange(addQuestion(itemIds, itemId))}
          />
        </>
      )}
    </div>
  );
}
