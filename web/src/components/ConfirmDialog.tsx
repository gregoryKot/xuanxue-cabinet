// Подтверждение действия с заметным эффектом (отмена занятия, удаление
// канала, отмена рассылки) — одна механика на весь кабинет (CLAUDE.md «Одна
// механика — один компонент»). `position: fixed; inset: 0` идёт через
// useHistorySheet, как любой полноэкранный слой (CLAUDE.md «Фронтенд») —
// кнопка «Назад» браузера закрывает диалог, а не уводит из кабинета.
// Подтверждение всегда закрывает диалог после ответа сервера, успех это был
// или сбой (`goBack()` — тот же путь, что у «Отмена») — иначе сообщение об
// ошибке остаётся невидимым под оверлеем подтверждения.
//
// Облик — «Тёплая школа» (docs/adr/0043-visual-direction-warm-school.md):
// белая карточка с мягкой тенью поверх затемнения, без границы; почему
// именно --card и --radius-block — у cardStyle ниже.
import type { CSSProperties } from 'react';
import { Button, type ButtonVariant } from './Button';
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
// Карточка диалога. Поверх затемнения (overlayStyle) её отделяет от экрана
// не граница, а сама поверхность — белая карточка с мягкой тенью. Прежний
// --surface-2 вёл на --paper, тон самой страницы: под затемнением такой
// диалог читался бы дырой в нём, а не листом поверх. Радиус блока, не строки
// списка: диалог несёт заголовок, текст и ряд кнопок целиком.
const cardStyle: CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-block)',
  boxShadow: 'var(--shadow-card)',
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
  /** Стиль кнопки подтверждения — по умолчанию `danger` (необратимое
   * действие: отмена занятия/рассылки, удаление канала). «Отправить сейчас»
   * (docs/PLAN.md §6 п.3) не разрушительно — передаёт `primary`, чтобы
   * красная кнопка не читалась как предупреждение об опасности. */
  confirmVariant?: ButtonVariant;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const goBack = useHistorySheet(onCancel);
  const { headingRef, containerRef } = useDialog(goBack);

  async function handleConfirm() {
    await onConfirm();
    goBack();
  }

  return (
    <div
      // Колбэк, а не containerRef напрямую — див ждёт ref на HTMLDivElement,
      // а useDialog отдаёт RefObject<HTMLElement | null> (M3, общий для
      // любого корня диалога); присваивание значения-подтипа обходится без
      // `as`-каста.
      ref={(node) => {
        containerRef.current = node;
      }}
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
            variant={confirmVariant}
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
