// Предпросмотр «глазами ученика» (ТЗ 4.3, обязательная часть): показывает
// экзамен так, как его увидит сдающий — вопросы по порядку, варианты
// неактивны. Это просмотр, а не сдача: ничего не сохраняется и не
// отправляется, формы здесь вовсе нет. Настоящий полноэкранный слой поверх
// страницы редактора — свой useHistorySheet/useDialog (CLAUDE.md «Фронтенд»),
// «Назад» браузера закрывает только предпросмотр.
import type { CSSProperties } from 'react';
import type { ExamItemDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';
import { ExamPreviewQuestions } from './ExamPreviewQuestions';

const LOADING_TEXT = 'Загружаем вопросы…';

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
  itemIds: string[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  bankItems: ExamItemDto[];
  bankLoading: boolean;
  onClose: () => void;
}

export function ExamPreview({
  title,
  description,
  itemIds,
  shuffleQuestions,
  shuffleOptions,
  bankItems,
  bankLoading,
  onClose,
}: ExamPreviewProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef, containerRef } = useDialog(goBack);

  return (
    <div
      // Колбэк вместо containerRef напрямую — див ждёт ref на HTMLDivElement,
      // useDialog отдаёт RefObject<HTMLElement | null> (M3); присваивание
      // значения-подтипа не требует `as`-каста.
      ref={(node) => {
        containerRef.current = node;
      }}
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
      ) : (
        <ExamPreviewQuestions
          itemIds={itemIds}
          shuffleQuestions={shuffleQuestions}
          shuffleOptions={shuffleOptions}
          bankItems={bankItems}
        />
      )}
    </div>
  );
}
