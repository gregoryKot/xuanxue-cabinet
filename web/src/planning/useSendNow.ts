// Состояние кнопки «Отправить ссылку сейчас» (docs/PLAN.md §6 п.3, аудит
// В12) — вынесено из LessonSheet.tsx/SendNowButton.tsx ради лимита файла
// (CLAUDE.md «Храповики»). Подтверждение — тот же ConfirmDialog, что у
// «Отменить занятие»/«Отменить рассылку» (CLAUDE.md «Одна механика — один
// компонент»), не отдельный диалог.
import { useState } from 'react';
import { errorFrom, type FormError } from '../components/FormServerError';

const SEND_NOW_ERROR = 'Не удалось отправить ссылку сейчас. Попробуйте ещё раз.';
// VOICE.md: короткая подпись без точки, конкретное время — «ближайшая
// минута», а не «скоро»/«идёт отправка».
export const SEND_NOW_SUCCESS = 'Ссылка уйдёт в ближайшую минуту';

export interface UseSendNowResult {
  confirming: boolean;
  pending: boolean;
  error: FormError | null;
  /** Подпись успеха видна, пока лист занятия открыт — новый клик или
   * повторное открытие листа её сбрасывают (setSuccess(false) при confirm). */
  success: boolean;
  openConfirm: () => void;
  closeConfirm: () => void;
  confirm: () => Promise<void>;
}

export function useSendNow(
  lessonId: string,
  onSendNow: (id: string) => Promise<void>,
): UseSendNowResult {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [success, setSuccess] = useState(false);

  async function confirm(): Promise<void> {
    setPending(true);
    setError(null);
    setSuccess(false);
    try {
      await onSendNow(lessonId);
      setSuccess(true);
    } catch (err) {
      setError(errorFrom(err, SEND_NOW_ERROR));
    } finally {
      setPending(false);
    }
  }

  return {
    confirming,
    pending,
    error,
    success,
    openConfirm: () => setConfirming(true),
    closeConfirm: () => setConfirming(false),
    confirm,
  };
}
