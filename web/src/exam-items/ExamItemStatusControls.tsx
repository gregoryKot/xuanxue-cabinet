// Статус вопроса — действием, а не выпадающим списком (ТЗ 4.2, «Лист»):
// examItemStatusActions.ts решает, какие переходы доступны для текущего
// статуса. Удаление — только у черновика (ExamItemsService.remove,
// exam-items.service.ts): на опубликованный или архивный вопрос могут
// ссылаться сданные работы — вместо кнопки объяснение, почему её нет.
import type { CSSProperties } from 'react';
import type { ExamItemStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { EXAM_ITEM_STATUS_LABELS_RU } from './examItemLabels';
import { examItemStatusActions } from './examItemStatusActions';

const NOT_DRAFT_EXPLANATIONS: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованный вопрос могут ссылаться сданные работы. Переведите его в архив вместо удаления.',
  archived:
    'Удалить нельзя — вопрос в архиве, на него могли остаться ссылки в сданных работах.',
};

const wrapperStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const rowStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const noteStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

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
    <div style={wrapperStyle}>
      <p style={noteStyle}>Статус: {EXAM_ITEM_STATUS_LABELS_RU[status]}</p>
      <div style={rowStyle}>
        {examItemStatusActions(status).map((action) => (
          <Button
            key={action.nextStatus}
            type="button"
            variant="secondary"
            pending={pending}
            onClick={() => onChangeStatus(action.nextStatus)}
          >
            {action.label}
          </Button>
        ))}
        {status === 'draft' && (
          <Button type="button" variant="danger" pending={pending} onClick={onRemove}>
            Удалить
          </Button>
        )}
      </div>
      {status !== 'draft' && <p style={noteStyle}>{NOT_DRAFT_EXPLANATIONS[status]}</p>}
    </div>
  );
}
