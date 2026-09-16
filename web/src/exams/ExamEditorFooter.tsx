// Подвал страницы редактора (макет Form.dc.html): «Сохранить» — единственная
// киноварь на экране, рядом текстом «Посмотреть глазами ученика». Под
// волосяной линией — строка статуса с действием и удаление. У нового экзамена
// ни строки статуса, ни удаления нет: статус появляется вместе с записью.
//
// Удаление разрешено только черновику (ExamsService.remove): на опубликованный
// и архивный экзамен ссылаются попытки учеников — вместо кнопки объяснение,
// почему её нет.
import type { CSSProperties } from 'react';
import type { ExamStatus } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { textLinkButtonStyle } from '../components/screenLayout';
import {
  DRAFT_PUBLISHED_ARCHIVED_LABELS_RU,
  draftPublishedArchivedTransitions,
} from '../lib/statusTransitions';

const STATUS_EXPLANATIONS: Record<ExamStatus, string> = {
  draft: 'ученики его не видят',
  published: 'ученики видят его в списке',
  archived: 'ученики его не видят, сданные работы остаются',
};
const NO_REMOVE_EXPLANATIONS: Record<'published' | 'archived', string> = {
  published:
    'Удалить нельзя — на опубликованный экзамен могут ссылаться попытки учеников. Отправьте его в архив.',
  archived: 'Удалить нельзя — на экзамен в архиве могли остаться ссылки в попытках.',
};

/** Черновику — только «Опубликовать» (макет Form.dc.html): архив ему незачем,
 * у него есть удаление ниже. Опубликованному и архивному — все переходы из
 * общей таблицы: удалять их нельзя, архив — единственный выход. */
function statusActions(status: ExamStatus) {
  const actions = draftPublishedArchivedTransitions(status);
  return status === 'draft'
    ? actions.filter((action) => action.nextStatus === 'published')
    : actions;
}

const actionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 24,
  flexWrap: 'wrap',
};
const statusRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
  color: 'var(--ink-soft)',
};
const statusActionsStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };
const noteStyle: CSSProperties = { margin: '14px 0 0', color: 'var(--ink-soft)' };

interface ExamEditorFooterProps {
  status: ExamStatus | null;
  pending: boolean;
  onPreview: () => void;
  onChangeStatus: (status: ExamStatus) => void;
  onRemove: () => void;
}

export function ExamEditorFooter({
  status,
  pending,
  onPreview,
  onChangeStatus,
  onRemove,
}: ExamEditorFooterProps) {
  return (
    <div>
      <div style={actionsRowStyle}>
        <Button type="submit" pending={pending}>
          Сохранить
        </Button>
        <button type="button" style={textLinkButtonStyle} onClick={onPreview}>
          Посмотреть глазами ученика
        </button>
      </div>

      {status && (
        <>
          <div style={statusRowStyle}>
            <span>
              <span className="xuanxue-status-label" style={{ color: 'var(--ink)' }}>
                {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status]}
              </span>{' '}
              · {STATUS_EXPLANATIONS[status]}
            </span>
            <span style={statusActionsStyle}>
              {statusActions(status).map((action) => (
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
            </span>
          </div>

          {status === 'draft' ? (
            <Button
              type="button"
              variant="danger"
              style={{ padding: 0, marginTop: 22 }}
              pending={pending}
              onClick={onRemove}
            >
              Удалить экзамен
            </Button>
          ) : (
            <p style={noteStyle}>{NO_REMOVE_EXPLANATIONS[status]}</p>
          )}
        </>
      )}
    </div>
  );
}
