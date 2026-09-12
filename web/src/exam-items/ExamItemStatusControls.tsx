// Статус вопроса — действием, а не выпадающим списком (ТЗ 4.2, «Лист»):
// examItemStatusActions.ts решает, какие переходы доступны для текущего
// статуса; сама кнопочная разметка — components/StatusActionButtons.tsx,
// общая с формой экзамена (exams/ExamStatusControls.tsx). Удаление — только
// у черновика (ExamItemsService.remove, exam-items.service.ts): на
// опубликованный или архивный вопрос могут ссылаться сданные работы —
// вместо кнопки объяснение, почему её нет.
import type { ExamItemStatus } from '@xuanxue/shared';
import { StatusActionButtons } from '../components/StatusActionButtons';
import { EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';
import { examItemStatusActions } from './examItemStatusActions';

const NOT_DRAFT_EXPLANATIONS: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованный вопрос могут ссылаться сданные работы. Переведите его в архив вместо удаления.',
  archived:
    'Удалить нельзя — вопрос в архиве, на него могли остаться ссылки в сданных работах.',
};

interface ExamItemStatusControlsProps {
  status: ExamItemStatus;
  pending: boolean;
  onChangeStatus: (status: ExamItemStatus) => void;
  onRemove: () => void;
}

export function ExamItemStatusControls({
  status,
  pending,
  onChangeStatus,
  onRemove,
}: ExamItemStatusControlsProps) {
  return (
    <StatusActionButtons
      statusLabel={EXAM_ITEM_STATUS_LABELS_RU[status]}
      pending={pending}
      actions={examItemStatusActions(status)}
      onChangeStatus={onChangeStatus}
      onRemove={status === 'draft' ? onRemove : undefined}
      explanation={status === 'draft' ? undefined : NOT_DRAFT_EXPLANATIONS[status]}
    />
  );
}
