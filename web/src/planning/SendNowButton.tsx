// «Отправить ссылку сейчас» на странице занятия (docs/PLAN.md §6 п.3, аудит
// В12): раньше единственный путь после «тик опоздал» — скопировать текст и
// создать рассылку руками (RUNBOOK §8.1 п.4). Не показывается у отменённого
// занятия — там его слать некуда (LessonEditorForm решает это по `cancelled`).
// Подтверждение — общий ConfirmDialog (CLAUDE.md «Одна механика — один
// компонент»), `primary`-кнопка подтверждения: действие не разрушительное.
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormServerError } from '../components/FormServerError';
import { useSendNow, SEND_NOW_SUCCESS } from './useSendNow';

const CONFIRM_MESSAGE =
  'Ссылка на занятие уйдёт во все подключённые каналы прямо сейчас, не дожидаясь обычного времени рассылки.';

interface SendNowButtonProps {
  lessonId: string;
  onSendNow: (id: string) => Promise<void>;
}

export function SendNowButton({ lessonId, onSendNow }: SendNowButtonProps) {
  const state = useSendNow(lessonId, onSendNow);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Button type="button" variant="secondary" onClick={state.openConfirm}>
        Отправить ссылку сейчас
      </Button>
      {state.success && (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-soft)' }}>
          {SEND_NOW_SUCCESS}
        </p>
      )}
      <FormServerError error={state.error} />

      {state.confirming && (
        <ConfirmDialog
          title="Отправить ссылку сейчас?"
          message={CONFIRM_MESSAGE}
          confirmLabel="Отправить сейчас"
          confirmVariant="primary"
          pending={state.pending}
          onConfirm={state.confirm}
          onCancel={state.closeConfirm}
        />
      )}
    </div>
  );
}
