// Подвал страницы-редактора (макет Form.dc.html): «Сохранить» — единственная
// заливка терракотой на экране, рядом текстом необязательное второе
// действие. Под волосяной линией — строка статуса с переходами и (не у
// экзамена — см. ниже) удаление. У новой записи (`status === null`) ни
// строки статуса, ни удаления нет: статус появляется вместе с записью.
//
// Один подвал на форму экзамена и вопрос — оба живут по
// draft/published/archived (CLAUDE.md «Одна механика — один компонент»).
// Домен приносит только тексты: что статус значит для ученика, как
// называется удаление и почему его нет. Строка статуса — EditorStatusRow.tsx:
// у вопроса она здесь, в подвале (`statusRow` с текстами и обработчиком), у
// экзамена — под названием страницы (`statusRow="elsewhere"`).
//
// Удаление черновика у вопроса — здесь же, кнопкой; у экзамена кнопка «Удалить
// экзамен» переехала наверх страницы, в строку с «К списку экзаменов»
// (ExamEditorForm.tsx, ADR-0139: владелец не находил её в конце длинного
// списка вопросов) — `removeLabel`/`onRemove` тогда не переданы, и блок
// удаления в подвале не рисуется вовсе. `noRemoveNotes` — частичный: экзамен
// оставляет здесь только объяснение для опубликованного (ExamEditorFooter.tsx),
// у архивного статус выше уже сказал «сданные работы остаются» — второй раз
// объяснять нечего.
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
  /** Подпись кнопки удаления: «Удалить вопрос». Не передано — кнопки в
   * подвале нет: удаление либо недоступно статусу, либо стоит на странице
   * отдельно (экзамен). */
  removeLabel?: string;
  /** Почему кнопки удаления нет у конкретного неудаляемого статуса — не
   * задано для статуса, значит подвал молчит про удаление вовсе. */
  noRemoveNotes?: Partial<Record<'published' | 'archived', string>>;
  pending: boolean;
  onRemove?: () => void;
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
  const noRemoveNote = status && status !== 'draft' ? noRemoveNotes?.[status] : undefined;
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

          {status === 'draft' && removeLabel && onRemove ? (
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
            noRemoveNote && (
              // Через RichText (ADR-0124) — акцент в объяснении «почему нельзя удалить».
              <p style={noteStyle}>
                <RichText text={noRemoveNote} />
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
