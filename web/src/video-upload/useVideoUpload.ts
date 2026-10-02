// Загрузка видео частями (ADR-0137, ADR-0165) — состояние одного экземпляра:
// экран заводит свой хук на каждое видео (на каждый вопрос), поэтому два
// видео одной попытки прогрессируют независимо, без Map по itemId. Сам
// сквозной прогон (отпечаток → старт → части → завершение, повтор, отмена) —
// videoUploadRunner.ts, а к какому маршруту сервера он ведёт — транспорт вида
// видео. Здесь только React state machine поверх них: idle → compressing
// (сжатие в браузере, ADR-0165; у маленького файла или браузера без WebCodecs
// пропускается) → uploading → waiting (пауза перед повтором) → done | failed |
// cancelled.
import { useCallback, useRef, useState } from 'react';
import {
  IDLE_VIDEO_UPLOAD_STATE,
  isVideoUploadActive,
  type VideoUploadState,
} from './videoUploadState';
import type { VideoUploadTransport } from './videoUploadTypes';
import { beginVideoUpload } from './beginVideoUpload';
import { canCompressVideo, compressVideo } from './compressVideo';
import { useScreenWakeLock } from './useScreenWakeLock';
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
  /** Подмена сжатия в тестах (сам перегон — compressVideo.ts). */
  compress?: typeof compressVideo;
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
  compress = compressVideo,
}: UseVideoUploadOptions<TResult>): UseVideoUploadResult {
  const [state, setState] = useState<VideoUploadState>(IDLE_VIDEO_UPLOAD_STATE);
  // Пока видео готовится, грузится или ждёт повтора — экран не гаснет (ADR-0165):
  // iOS усыпляет страницу с погасшим экраном, и загрузка встаёт.
  useScreenWakeLock(isVideoUploadActive(state));
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
      runIdRef.current += 1;
      const thisRun = runIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCancelled = () => runIdRef.current !== thisRun || controller.signal.aborted;

      const upload = (prepared: Blob) =>
        beginVideoUpload({
          prepared,
          transport: createTransport(),
          signal: controller.signal,
          isCancelled,
          waitForResume,
          setState,
          onDone,
          maxBytes,
          tooLargeMessage,
        });

      if (!canCompressVideo(file.size)) {
        setState({
          ...IDLE_VIDEO_UPLOAD_STATE,
          phase: 'uploading',
          totalBytes: file.size,
        });
        upload(file);
        return;
      }
      setState({
        ...IDLE_VIDEO_UPLOAD_STATE,
        phase: 'compressing',
        totalBytes: file.size,
      });
      // Отвергается сжатие только отменой — тогда выходим молча; любой другой
      // сбой compress уже превратил в исходный файл.
      void compress(file, {
        signal: controller.signal,
        onProgress: (fraction) =>
          setState((prev) => ({ ...prev, compressProgress: fraction })),
      }).then(
        (prepared) => {
          if (!isCancelled()) upload(prepared);
        },
        () => undefined,
      );
    },
    [createTransport, onDone, maxBytes, tooLargeMessage, waitForResume, compress],
  );

  return { state, selectFile, cancel, resumeNow: release };
}
