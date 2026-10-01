// «Отправить» на форме сдачи: сначала flush автосохранения, потом сам
// submit — и два отказа словами до любого запроса. Вынесено из
// AttemptInProgress.tsx (храповик размера файлов, CLAUDE.md «Храповики»),
// тестируется без DOM.
//
// Отправка ждёт flush() (аудит 2026-09-21, HIGH «потеря последнего ответа
// ученика», docs/PLAN.md §11): раньше submit() (useAttempt.ts) слал POST не
// дожидаясь PATCH — выбор варианта в последние секунды или гонка PATCH/POST
// теряли ответ, сервер отвечал «попытка уже не in_progress»
// (exam-attempt-save.ts). Тексты — VOICE.md: на «вы», с действием.
//
// Аудит 2026-10-01 (H): «Отправить» размонтировало блок загрузки видео, тот
// обрывал свои запросы, и ученик думал, что видео ушло. Пока часть файла в
// полёте (activeUploads.ts), отправка отказывает словами, не молча.
import { useCallback, useState } from 'react';
import type { FormError } from '../components/FormServerError';
import { hasActiveUploads } from './activeUploads';

export const FLUSH_ERROR_MESSAGE =
  'Не удалось сохранить последний ответ. Проверьте интернет и попробуйте ещё раз.';
export const UPLOAD_IN_PROGRESS_MESSAGE =
  'Видео ещё загружается. Дождитесь конца загрузки и отправьте снова.';

export interface UseAttemptSubmitFlowResult {
  /** Никогда не бросает — ConfirmDialog закрывает себя после `onConfirm`
   * независимо от исхода (ConfirmDialog.tsx), сбой остаётся на экране. */
  handleSubmit: () => Promise<void>;
  flushing: boolean;
  flushError: FormError | null;
}

export function useAttemptSubmitFlow(
  flush: () => Promise<void>,
  onSubmit: () => Promise<void>,
): UseAttemptSubmitFlowResult {
  const [flushError, setFlushError] = useState<FormError | null>(null);
  const [flushing, setFlushing] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (hasActiveUploads()) {
      setFlushError({ message: UPLOAD_IN_PROGRESS_MESSAGE });
      return;
    }
    setFlushing(true);
    try {
      await flush();
    } catch {
      setFlushError({ message: FLUSH_ERROR_MESSAGE });
      return;
    } finally {
      setFlushing(false);
    }
    setFlushError(null);
    await onSubmit();
  }, [flush, onSubmit]);

  return { handleSubmit, flushing, flushError };
}
