// Загрузка видео частями (ADR-0137, ADR-0165) — состояние одного экземпляра:
// экран заводит свой хук на каждое видео (на каждый вопрос), поэтому два
// видео одной попытки прогрессируют независимо, без Map по itemId. Сам
// сквозной прогон (отпечаток → старт → части → завершение, повтор, отмена) —
// videoUploadRunner.ts, а к какому маршруту сервера он ведёт — транспорт вида
// видео. Здесь только React state machine поверх них: idle → uploading →
// waiting (пауза перед повтором) → done | failed | cancelled.
import { useCallback, useRef, useState } from 'react';
import { IDLE_VIDEO_UPLOAD_STATE, type VideoUploadState } from './videoUploadState';
import { checkVideoFileSize } from './videoUploadParts';
import { runVideoUpload } from './videoUploadRunner';
import type { VideoUploadProgressUpdate, VideoUploadTransport } from './videoUploadTypes';
import { realSleep, useUploadPause } from './useUploadPause';

export interface UseVideoUploadOptions<TResult extends object> {
  /** Собирает транспорт на каждый выбор файла — так он видит актуальные
   * `attemptId`/`itemId`, а выбор файла не зависит от того, как часто
   * перерисовывается экран. */
  createTransport: () => VideoUploadTransport<TResult>;
  /** Готовый результат — кладёт его на экран без второго GET
   * (useAttempt.ts, ADR-0087). */
  onDone: (result: TResult) => void;
  /** Потолок размера и текст отказа у каждого вида видео свой. */
  maxBytes: number;
  tooLargeMessage: string;
  sleep?: (ms: number) => Promise<void>;
}

export interface UseVideoUploadResult {
  state: VideoUploadState;
  /** Выбор (или повторный выбор того же) файла — начинает или продолжает
   * загрузку с первой недостающей части (сервер помнит принятые). */
  selectFile: (file: File) => void;
  /** Обрывает текущие запросы локально; на сервере загрузка остаётся —
   * выбор того же файла снова продолжит её (ADR-0137). */
  cancel: () => void;
  /** «Продолжить сейчас» — не ждать таймера паузы. */
  resumeNow: () => void;
}

export function useVideoUpload<TResult extends object>({
  createTransport,
  onDone,
  maxBytes,
  tooLargeMessage,
  sleep = realSleep,
}: UseVideoUploadOptions<TResult>): UseVideoUploadResult {
  const [state, setState] = useState<VideoUploadState>(IDLE_VIDEO_UPLOAD_STATE);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const markWaiting = useCallback(
    () => setState((prev) => ({ ...prev, phase: 'waiting' })),
    [],
  );
  // Размонтирование загрузку не обрывает (аудит 2026-10-01, F04): «Отправить»
  // переключает экран, а части идут дальше, и результат попадёт на экран через
  // onDone (живёт выше блока загрузки). Обрыв — только cancel и новый файл.
  const { waitForResume, release } = useUploadPause(sleep, markWaiting);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    release();
    setState((prev) =>
      prev.phase === 'idle' || prev.phase === 'done'
        ? prev
        : { ...prev, phase: 'cancelled', error: null },
    );
  }, [release]);

  const selectFile = useCallback(
    (file: File) => {
      const sizeError = checkVideoFileSize(file.size, maxBytes, tooLargeMessage);
      if (sizeError) {
        setState({
          ...IDLE_VIDEO_UPLOAD_STATE,
          phase: 'failed',
          error: { message: sizeError },
        });
        return;
      }

      runIdRef.current += 1;
      const thisRun = runIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCancelled = () => runIdRef.current !== thisRun || controller.signal.aborted;

      // До ответа старта размер части знает только сервер; на полосе это не
      // видно — отправлено ноль частей.
      setState({ ...IDLE_VIDEO_UPLOAD_STATE, phase: 'uploading', totalBytes: file.size });

      // Колбэки без своей проверки isCancelled(): прогон (videoUploadRunner.ts)
      // уже сверяет её синхронно перед каждым вызовом — второй раз то же самое
      // значение здесь не изменится, а мёртвая ветка только путает читателя
      // (CLAUDE.md «Дубли и мёртвый код»).
      void runVideoUpload({
        file,
        transport: createTransport(),
        signal: controller.signal,
        isCancelled,
        onProgress: (progress: VideoUploadProgressUpdate) => {
          setState({
            ...progress,
            phase: 'uploading',
            totalBytes: file.size,
            error: null,
          });
        },
        waitForResume,
        onFailed: (error) => {
          setState((prev) => ({ ...prev, phase: 'failed', error }));
        },
        onDone: (result) => {
          onDone(result);
          setState({ ...IDLE_VIDEO_UPLOAD_STATE, phase: 'done' });
        },
      });
    },
    [createTransport, onDone, maxBytes, tooLargeMessage, waitForResume],
  );

  return { state, selectFile, cancel, resumeNow: release };
}
