// Подвал страницы-редактора (макет Form.dc.html): «Сохранить» — единственная
// заливка терракотой на экране, рядом текстом необязательное второе
// действие. Под волосяной линией — строка статуса с переходами и удаление. У
// новой записи (`status === null`) ни строки статуса, ни удаления нет: статус
// появляется вместе с записью.
//
// Один подвал на форму экзамена и вопрос — оба живут по
// draft/published/archived и оба разрешают удаление только черновику
// (CLAUDE.md «Одна механика — один компонент»). Домен приносит только тексты:
// что статус значит для ученика, как называется удаление и почему его нет.
// Строка статуса — EditorStatusRow.tsx: у вопроса она здесь, в подвале
// (`statusRow` с текстами и обработчиком), у экзамена — под названием
// страницы (`statusRow="elsewhere"`), а удаление и объяснение «почему удалить
// нельзя» остаются в подвале у обоих.
import type { CSSProperties, ReactNode } from 'react';
import { Button } from './Button';
import { editorActionsRowStyle } from './editorLayout';
import { EditorStatusRow } from './EditorStatusRow';
import { RichText } from './RichText';
import type { DraftPublishedArchivedStatus } from '../lib/statusTransitions';

const noteStyle: CSSProperties = { margin: '14px 0 0', color: 'var(--ink-soft)' };

interface EditorFooterProps {
  /** `null` — записи ещё нет на сервере. */
  status: DraftPublishedArchivedStatus | null;
  /** Строка статуса с переходами в подвале — или `'elsewhere'`, если страница
   * рисует её сама (экзамен — под названием). */
  statusRow: EditorFooterStatusRow | 'elsewhere';
  /** Подпись кнопки удаления: «Удалить экзамен», «Удалить вопрос». */
  removeLabel: string;
  /** Почему кнопки удаления нет у неудаляемых статусов. */
  noRemoveNotes: Record<'published' | 'archived', string>;
  pending: boolean;
  onRemove: () => void;
  /** Второе действие рядом с «Сохранить» — текстом, не кнопкой. */
  extraAction?: ReactNode;
}

interface EditorFooterStatusRow {
  /** Что статус значит для ученика — одной строкой рядом с подписью. */
  explanations: Record<DraftPublishedArchivedStatus, string>;
  onChangeStatus: (status: DraftPublishedArchivedStatus) => void;
}

export function EditorFooter({
  status,
  statusRow,
  removeLabel,
  noRemoveNotes,
  pending,
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
          {statusRow !== 'elsewhere' && (
            <EditorStatusRow
              status={status}
              explanations={statusRow.explanations}
              placement="footer"
              pending={pending}
              onChangeStatus={statusRow.onChangeStatus}
            />
          )}

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
            // Через RichText (ADR-0124) — акцент в объяснении «почему нельзя удалить».
            <p style={noteStyle}>
              <RichText text={noRemoveNotes[status]} />
            </p>
          )}
        </>
      )}
    </div>
  );
}
