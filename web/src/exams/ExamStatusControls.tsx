// Статус формы — действием, а не выпадающим списком (ТЗ 4.3, «Лист»):
// переходы и кнопки — components/StatusActionButtons.tsx, общие с вопросом
// банка (exam-items/ExamItemStatusControls.tsx). Удаление — только у
// черновика (ExamsService.remove, exams.service.ts): на опубликованную или
// архивную форму могут ссылаться попытки учеников — вместо кнопки
// объяснение, почему её нет.
import type { ExamStatus } from '@xuanxue/shared';
import { StatusActionButtons } from '../components/StatusActionButtons';
import {
  DRAFT_PUBLISHED_ARCHIVED_LABELS_RU,
  draftPublishedArchivedTransitions,
} from '../lib/statusTransitions';

const NOT_DRAFT_EXPLANATIONS: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованную форму могут ссылаться попытки учеников. Переведите её в архив вместо удаления.',
  archived:
    'Удалить нельзя — форма в архиве, на неё могли остаться ссылки в попытках учеников.',
};

interface ExamStatusControlsProps {
  status: ExamStatus;
  pending: boolean;
  onChangeStatus: (status: ExamStatus) => void;
  onRemove: () => void;
}

export function ExamStatusControls({
  status,
  pending,
  onChangeStatus,
  onRemove,
}: ExamStatusControlsProps) {
  return (
    <StatusActionButtons
      statusLabel={DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status]}
      pending={pending}
      actions={draftPublishedArchivedTransitions(status)}
      onChangeStatus={onChangeStatus}
      onRemove={status === 'draft' ? onRemove : undefined}
      explanation={status === 'draft' ? undefined : NOT_DRAFT_EXPLANATIONS[status]}
    />
  );
}
