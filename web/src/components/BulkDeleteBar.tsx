// Бар массового удаления (ADR-0141) — единственная механика на любой список
// кабинета: кнопка «Выбрать», сам режим выбора и итог. Подключён у «Вопросов»
// и «Экзаменов» (ExamItemsScreen.tsx/ExamsScreen.tsx), следующий список
// берёт готовый компонент, а не копирует бар.
//
// `confirmMessage` — проп, не общий текст: последствие удаления у каждой
// коллекции своё (ADR-0140, мягкое удаление) — вопрос остаётся в экзаменах,
// где уже стоит, экзамен пропадает у учеников сразу. Общей фразой было бы
// либо неверно, либо расплывчато; экран передаёт свою правду сам
// (examItemLabels.ts#EXAM_ITEM_BULK_DELETE_MESSAGE, examCounts.ts#EXAM_BULK_DELETE_MESSAGE).
import type { CSSProperties } from 'react';
import type { PluralForms } from '@xuanxue/shared';
import type { UseBulkDeleteResult } from '../hooks/useBulkDelete';
import { formatBulkDeleteTitle, formatSelectedCount } from '../lib/bulkDeleteText';
import { Button } from './Button';
import { BulkDeleteSummary } from './BulkDeleteSummary';
import { ConfirmDialog } from './ConfirmDialog';
import { FormServerError } from './FormServerError';
import { RichText } from './RichText';
import { TextLinkButton } from './TextLinkButton';

// sticky, не fixed: бар остаётся под рукой при скролле длинного списка, но
// не выходит из потока страницы — не полноэкранный слой, useHistorySheet не
// нужен (CLAUDE.md «Фронтенд» про `position: fixed; inset: 0` сюда не относится).
const barStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  background: 'var(--paper)',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  padding: '10px 0',
};
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  marginLeft: 'auto',
};
const startRowStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end' };

interface BulkDeleteBarProps {
  bulk: UseBulkDeleteResult;
  forms: PluralForms;
  /** Список пуст — кнопки «Выбрать» нет, есть только раньше показанный итог. */
  hasItems: boolean;
  confirmMessage: string;
}

export function BulkDeleteBar({
  bulk,
  forms,
  hasItems,
  confirmMessage,
}: BulkDeleteBarProps) {
  if (!bulk.isSelecting) {
    if (!hasItems && !bulk.result) return null;
    return (
      <div>
        {hasItems && (
          <div style={startRowStyle}>
            <TextLinkButton onClick={bulk.start}>Выбрать</TextLinkButton>
          </div>
        )}
        <BulkDeleteSummary result={bulk.result} forms={forms} />
      </div>
    );
  }

  return (
    <>
      <div style={barStyle}>
        <span>
          <RichText text={formatSelectedCount(bulk.selectedVisibleIds.length)} />
        </span>
        <div style={actionsRowStyle}>
          <TextLinkButton onClick={bulk.toggleAllVisible}>
            {bulk.allVisibleSelected ? 'Снять все' : 'Выбрать все'}
          </TextLinkButton>
          <Button
            variant="danger"
            disabled={bulk.selectedVisibleIds.length === 0}
            pending={bulk.pending}
            onClick={bulk.requestDelete}
          >
            Удалить
          </Button>
          <TextLinkButton onClick={bulk.stop}>Готово</TextLinkButton>
        </div>
      </div>
      <FormServerError error={bulk.error ? { message: bulk.error } : null} />
      <BulkDeleteSummary result={bulk.result} forms={forms} />
      {bulk.confirming && (
        <ConfirmDialog
          title={formatBulkDeleteTitle(bulk.selectedVisibleIds.length, forms)}
          message={confirmMessage}
          confirmLabel="Удалить"
          pending={bulk.pending}
          onConfirm={bulk.confirmDelete}
          onCancel={bulk.cancelDelete}
        />
      )}
    </>
  );
}
