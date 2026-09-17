// Подвал страницы-редактора (макет Form.dc.html): «Сохранить» — единственная
// киноварь на экране, рядом текстом необязательное второе действие. Под
// волосяной линией — строка статуса с переходами и удаление. У новой записи
// (`status === null`) ни строки статуса, ни удаления нет: статус появляется
// вместе с записью.
//
// Один подвал на форму экзамена и вопрос — оба живут по
// draft/published/archived и оба разрешают удаление только черновику
// (CLAUDE.md «Одна механика — один компонент»). Домен приносит только тексты:
// что статус значит для ученика, как называется удаление и почему его нет.
import type { CSSProperties, ReactNode } from 'react';
import { Button } from './Button';
import { editorActionsRowStyle } from './screenLayout';
import {
  DRAFT_PUBLISHED_ARCHIVED_LABELS_RU,
  draftPublishedArchivedTransitions,
  type DraftPublishedArchivedStatus,
} from '../lib/statusTransitions';

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

/** Черновику — только «Опубликовать» (макет Form.dc.html): архив ему незачем,
 * у него есть удаление ниже. Опубликованному и архивному — все переходы из
 * общей таблицы: удалять их нельзя, архив — единственный выход. */
function statusActions(status: DraftPublishedArchivedStatus) {
  const actions = draftPublishedArchivedTransitions(status);
  return status === 'draft'
    ? actions.filter((action) => action.nextStatus === 'published')
    : actions;
}

interface EditorFooterProps {
  /** `null` — записи ещё нет на сервере. */
  status: DraftPublishedArchivedStatus | null;
  /** Что статус значит для ученика — одной строкой рядом с подписью. */
  explanations: Record<DraftPublishedArchivedStatus, string>;
  /** Подпись кнопки удаления: «Удалить экзамен», «Удалить вопрос». */
  removeLabel: string;
  /** Почему кнопки удаления нет у неудаляемых статусов. */
  noRemoveNotes: Record<'published' | 'archived', string>;
  pending: boolean;
  onChangeStatus: (status: DraftPublishedArchivedStatus) => void;
  onRemove: () => void;
  /** Второе действие рядом с «Сохранить» — текстом, не кнопкой. */
  extraAction?: ReactNode;
}

export function EditorFooter({
  status,
  explanations,
  removeLabel,
  noRemoveNotes,
  pending,
  onChangeStatus,
  onRemove,
  extraAction,
}: EditorFooterProps) {
  return (
    <div>
      <div style={editorActionsRowStyle}>
        <Button type="submit" pending={pending}>
          Сохранить
        </Button>
        {extraAction}
      </div>

      {status && (
        <>
          <div style={statusRowStyle}>
            <span>
              <span className="xuanxue-status-label" style={{ color: 'var(--ink)' }}>
                {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status]}
              </span>{' '}
              · {explanations[status]}
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
              {removeLabel}
            </Button>
          ) : (
            <p style={noteStyle}>{noRemoveNotes[status]}</p>
          )}
        </>
      )}
    </div>
  );
}
