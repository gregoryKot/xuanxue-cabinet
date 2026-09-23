// Строка статуса записи с переходами: подпись, что статус значит для
// ученика, и кнопки «Опубликовать» / «В архив» / «Вернуть в черновик».
// Вынесена из EditorFooter.tsx, потому что у экзамена она стоит наверху
// страницы, под названием (владелец просил не искать «Опубликовать» в
// подвале), а у вопроса — по-прежнему в подвале. Один компонент на оба места
// (CLAUDE.md «Одна механика — один компонент»); место задаёт `placement`.
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { RichText } from './RichText';
import {
  DRAFT_PUBLISHED_ARCHIVED_LABELS_RU,
  draftPublishedArchivedTransitions,
  type DraftPublishedArchivedStatus,
} from '../lib/statusTransitions';

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  color: 'var(--ink-soft)',
};
// В подвале строка отделена волосяной линией от «Сохранить»; под заголовком
// линия не нужна — над ней и так только название.
const footerPlacementStyle: CSSProperties = {
  marginTop: 22,
  paddingTop: 16,
  borderTop: '1px solid var(--line)',
};
const actionsStyle: CSSProperties = { display: 'flex', gap: 10, flexWrap: 'wrap' };

/** Черновику — только «Опубликовать» (макет Form.dc.html): архив ему незачем,
 * у него есть удаление в подвале. Опубликованному и архивному — все переходы
 * из общей таблицы: удалять их нельзя, архив — единственный выход. */
function statusActions(status: DraftPublishedArchivedStatus) {
  const actions = draftPublishedArchivedTransitions(status);
  return status === 'draft'
    ? actions.filter((action) => action.nextStatus === 'published')
    : actions;
}

type EditorStatusRowPlacement = 'footer' | 'heading';

interface EditorStatusRowProps {
  status: DraftPublishedArchivedStatus;
  /** Что статус значит для ученика — одной строкой рядом с подписью. */
  explanations: Record<DraftPublishedArchivedStatus, string>;
  placement: EditorStatusRowPlacement;
  pending: boolean;
  onChangeStatus: (status: DraftPublishedArchivedStatus) => void;
}

export function EditorStatusRow({
  status,
  explanations,
  placement,
  pending,
  onChangeStatus,
}: EditorStatusRowProps) {
  const style =
    placement === 'footer' ? { ...rowStyle, ...footerPlacementStyle } : rowStyle;
  return (
    <div style={style}>
      <span>
        <span className="xuanxue-status-label" style={{ color: 'var(--ink)' }}>
          {DRAFT_PUBLISHED_ARCHIVED_LABELS_RU[status]}
        </span>{' '}
        {/* Через RichText (ADR-0124) — акцент в объяснении статуса. */}
        · <RichText text={explanations[status]} />
      </span>
      <span style={actionsStyle}>
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
  );
}
