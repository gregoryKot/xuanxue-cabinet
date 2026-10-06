// Вопрос «Вы начинаете экзамен» перед стартом попытки с лимитом времени или
// повтором, затирающим прошлую (ADR-0121, ADR-0131). Вынесен из TasksScreen,
// чтобы тот же диалог открывался и с «Доски» (ADR-0173) без второй копии.
// Тексты и вариант кнопки уже посчитаны в `taskStart.confirm`
// (examStartConfirm.ts); закрытие и переход после старта — useTaskStart.ts.
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { UseTaskStartResult } from './useTaskStart';

interface TaskStartDialogProps {
  taskStart: UseTaskStartResult;
}

export function TaskStartDialog({ taskStart }: TaskStartDialogProps) {
  const { confirm, pendingExamId, confirmStart, cancelConfirm } = taskStart;
  if (!confirm) return null;
  return (
    <ConfirmDialog
      title={confirm.copy.title}
      message={confirm.copy.message}
      confirmLabel={confirm.copy.confirmLabel}
      cancelLabel={confirm.copy.cancelLabel}
      confirmVariant={confirm.copy.confirmVariant}
      pending={pendingExamId === confirm.exam.id}
      onConfirm={() => confirmStart(confirm.exam)}
      onCancel={cancelConfirm}
    />
  );
}
