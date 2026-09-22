// Подтверждение действия с заметным эффектом (отмена занятия, удаление
// канала, отмена рассылки) — одна механика на весь кабинет (CLAUDE.md «Одна
// механика — один компонент»). Оверлей, карточка и обвязка доступности —
// общие с NoticeDialog.tsx через DialogShell.tsx (та же механика, разница
// только в ряде кнопок: здесь их две). Подтверждение всегда закрывает диалог
// после ответа сервера, успех это был или сбой (`close()` — тот же путь, что
// у «Отмена») — иначе сообщение об ошибке остаётся невидимым под оверлеем
// подтверждения.
import { Button, type ButtonVariant } from './Button';
import { DialogShell } from './DialogShell';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** Подпись отказа — по умолчанию «Отмена». Своя нужна там, где отказ ведёт
   * не в никуда, а обратно к работе: «Вернуться к вопросам» на форме сдачи
   * (attempt/AttemptSubmitBar.tsx) — ученику сказали, что вопросы без ответа
   * подсвечены, и кнопка обязана вести именно туда (docs/VOICE.md: кнопка —
   * глагол и действие). */
  cancelLabel?: string;
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
  cancelLabel = 'Отмена',
  pending,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  async function handleConfirm(close: () => void) {
    await onConfirm();
    close();
  }

  return (
    <DialogShell
      title={title}
      onClose={onCancel}
      renderActions={(close) => (
        <>
          <Button type="button" variant="secondary" onClick={close}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={confirmVariant}
            pending={pending}
            onClick={() => void handleConfirm(close)}
          >
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <p style={{ margin: 0 }}>{message}</p>
    </DialogShell>
  );
}
