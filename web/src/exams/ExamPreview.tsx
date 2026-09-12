// Предпросмотр «глазами ученика» (ТЗ 4.3, обязательная часть): показывает
// форму так, как её увидит сдающий — блоки с заголовками, вопросы по
// порядку, варианты неактивны. Это просмотр, а не сдача: ничего не
// сохраняется и не отправляется, formы здесь вовсе нет. Полноэкранный слой
// поверх листа формы — как ConfirmDialog (CLAUDE.md «Фронтенд»): свой
// useHistorySheet/useDialog, «Назад» браузера закрывает только предпросмотр.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import type { ExamBlockDraft } from './examBlocksInput';
import { ExamPreviewBlock } from './ExamPreviewBlock';

const LOADING_TEXT = 'Загружаем вопросы…';
const EMPTY_TEXT = 'В форме пока нет блоков — сдающий увидит пустой экзамен.';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--surface)',
  overflowY: 'auto',
  zIndex: 70,
  padding: 20,
};
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  marginBottom: 16,
};
const descriptionStyle: CSSProperties = { color: 'var(--ink-soft)' };

interface ExamPreviewProps {
  title: string;
  description: string;
  blocks: ExamBlockDraft[];
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  onClose: () => void;
}

export function ExamPreview({
  title,
  description,
  blocks,
  bankItems,
  bankLoading,
  onClose,
}: ExamPreviewProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef } = useDialog(goBack);

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="exam-preview-title"
    >
      <div style={headerStyle}>
        <h2 ref={headingRef} tabIndex={-1} id="exam-preview-title" style={{ margin: 0 }}>
          {title.trim() || 'Экзамен без названия'}
        </h2>
        <Button type="button" variant="secondary" onClick={goBack}>
          Закрыть
        </Button>
      </div>

      {description && <p style={descriptionStyle}>{description}</p>}

      {bankLoading ? (
        <p>{LOADING_TEXT}</p>
      ) : blocks.length === 0 ? (
        <p>{EMPTY_TEXT}</p>
      ) : (
        blocks.map((block, index) => (
          <ExamPreviewBlock key={block.id ?? index} block={block} bankItems={bankItems} />
        ))
      )}
    </div>
  );
}
