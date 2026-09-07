// Подтверждение действия с заметным эффектом (отмена занятия, удаление
// канала, отмена рассылки) — одна механика на весь кабинет (CLAUDE.md «Одна
// механика — один компонент»). `position: fixed; inset: 0` идёт через
// useHistorySheet, как любой полноэкранный слой (CLAUDE.md «Фронтенд») —
// кнопка «Назад» браузера закрывает диалог, а не уводит из кабинета.
// Подтверждение всегда закрывает диалог после ответа сервера, успех это был
// или сбой (`goBack()` — тот же путь, что у «Отмена») — иначе сообщение об
// ошибке остаётся невидимым под оверлеем подтверждения.
import type { CSSProperties } from 'react';
import { Button } from './Button';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 20, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 60,
};
const cardStyle: CSSProperties = {
  background: 'var(--surface-2)',
  borderRadius: 16,
  padding: 20,
  maxWidth: 360,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const goBack = useHistorySheet(onCancel);
  const { headingRef } = useDialog(goBack);

  async function handleConfirm() {
    await onConfirm();
    goBack();
  }

  return (
    <div
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div style={cardStyle}>
        <h2
          ref={headingRef}
          tabIndex={-1}
          id="confirm-dialog-title"
          style={{ margin: 0, fontSize: 17 }}
        >
          {title}
        </h2>
        <p style={{ margin: 0 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={goBack}>
            Отмена
          </Button>
          <Button
            type="button"
            variant="danger"
            pending={pending}
            onClick={() => void handleConfirm()}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
