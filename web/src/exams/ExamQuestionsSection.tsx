// Раздел «Вопросы» страницы редактора (макет Form.dc.html): счётчик в
// подписи-рубрике, нумерованный список выбранных и поиск под ним. Рядом с
// поиском — «Новый вопрос» (ADR-0040): владелец просил заводить вопрос там,
// где он нужен, не уходить в «Вопросы» и обратно. Строку списка можно
// раскрыть и изменить вопрос на месте (отзыв владельца 2026-09-27) — та же
// форма, что и создание (QuestionInlineForm.tsx), поэтому открыта разом
// только одна: своё состояние `activeForm` держит какая — 'new', id строки
// или ничего. Созданный/изменённый вопрос добавлен в `createdItems`, чтобы
// список выбранных сразу увидел его — второго запроса не нужно
// (examQuestions.mergeCreatedItems). Правки порядка — чистые функции
// examQuestions.ts, здесь только связка с состоянием формы.
import { useState, type CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { ExamAttemptsNote } from './ExamAttemptsNote';
import { ExamQuestionList } from './ExamQuestionList';
import { ExamQuestionSearch } from './ExamQuestionSearch';
import { QuestionInlineForm } from './QuestionInlineForm';
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
  requiredIds: string[];
  requiredEnabled: boolean;
  onToggleRequired: (itemId: string) => void;
  bankItems: ExamItemDto[] | null;
  bankLoading: boolean;
  bankError: string | null;
  onRetryBank: () => void;
  /** `undefined` у нового экзамена (`/exams/new`) — попыток ещё нет и
   * заметки о них тоже (ExamAttemptsNote.tsx). */
  examId?: string;
}

export function ExamQuestionsSection({
  itemIds,
  onChange,
  requiredIds,
  requiredEnabled,
  onToggleRequired,
  bankItems,
  bankLoading,
  bankError,
  onRetryBank,
  examId,
}: ExamQuestionsSectionProps) {
  // 'new' — форма создания; id строки — правка этого вопроса; null — обе
  // закрыты. Один флаг, а не два булевых — открыть можно только что-то одно.
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [createdItems, setCreatedItems] = useState<ExamItemDto[]>([]);
  const listItems = mergeCreatedItems(bankItems ?? [], createdItems);
  const editingId = activeForm && activeForm !== 'new' ? activeForm : null;

  function handleCreated(item: ExamItemDto) {
    setCreatedItems((prev) => mergeCreatedItems(prev, [item]));
    onChange(addQuestion(itemIds, item.id));
    setActiveForm(null);
  }

  function handleEdited(item: ExamItemDto) {
    setCreatedItems((prev) => mergeCreatedItems(prev, [item]));
    setActiveForm(null);
  }

  return (
    <div style={columnStyle}>
      <span className="xuanxue-eyebrow">Вопросы · {itemIds.length}</span>
      {examId && <ExamAttemptsNote examId={examId} />}

      <ExamQuestionList
        itemIds={itemIds}
        bankItems={listItems}
        bankLoading={bankLoading}
        requiredIds={requiredIds}
        requiredEnabled={requiredEnabled}
        onToggleRequired={onToggleRequired}
        onMoveUp={(index) => onChange(moveQuestionUp(itemIds, index))}
        onMoveDown={(index) => onChange(moveQuestionDown(itemIds, index))}
        onRemove={(itemId) => onChange(removeQuestion(itemIds, itemId))}
        editingId={editingId}
        formsOpen={activeForm !== null}
        onStartEdit={(itemId) => setActiveForm(itemId)}
        onCancelEdit={() => setActiveForm(null)}
        onSaved={handleEdited}
      />

      {activeForm === 'new' && (
        <QuestionInlineForm
          item={null}
          onSaved={handleCreated}
          onCancel={() => setActiveForm(null)}
        />
      )}

      {activeForm === null && (
        <>
          <Button variant="secondary" onClick={() => setActiveForm('new')}>
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
