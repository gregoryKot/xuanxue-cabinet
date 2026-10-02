// Пауза загрузки видео перед повтором (ADR-0137): ждёт таймера, но «Продолжить
// сейчас», возврат сети (`online`) или отмена снимают её досрочно. Вынесено из
// useVideoUpload.ts (файловый лимит, CLAUDE.md «Храповики»): хуку загрузки
// нужны только `waitForResume` для прогона и `release` для отмены и кнопки.
import { useCallback, useEffect, useRef } from 'react';

/** Настоящая пауза — по умолчанию; тесты подставляют свою без реальных
 * таймеров (CLAUDE.md «Детерминизм»). */
export function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MS_IN_SECOND = 1000;

export interface UploadPause {
  waitForResume: (delaySec: number) => Promise<void>;
  /** Снимает текущую паузу; без паузы ничего не делает. */
  release: () => void;
}

/** `onWaiting` зовётся при входе в паузу — хук загрузки по нему ставит фазу
 * `waiting`. */
export function useUploadPause(
  sleep: (ms: number) => Promise<void>,
  onWaiting: () => void,
): UploadPause {
  const resumeRef = useRef<(() => void) | null>(null);

  const release = useCallback(() => {
    resumeRef.current?.();
    resumeRef.current = null;
  }, []);

  useEffect(() => {
    // Сеть вернулась — продолжаем сами, не дожидаясь таймера паузы (ADR-0137).
    window.addEventListener('online', release);
    return () => window.removeEventListener('online', release);
  }, [release]);

  const waitForResume = useCallback(
    (delaySec: number) => {
      onWaiting();
      return new Promise<void>((resolve) => {
        resumeRef.current = resolve;
        void sleep(delaySec * MS_IN_SECOND).then(resolve);
      });
    },
    [sleep, onWaiting],
  );

  return { waitForResume, release };
}
