// Загрузка видео частями (ADR-0137, ADR-0165) — состояние одного экземпляра:
// экран заводит свой хук на каждое видео, два видео прогрессируют независимо.
// Прогон — videoUploadRunner.ts, маршруты — транспорт вида видео; здесь React state
// machine: idle → compressing (ADR-0165) → uploading → waiting → done | failed | cancelled.
import { useCallback, useRef, useState } from 'react';
import {
  IDLE_VIDEO_UPLOAD_STATE,
  isVideoUploadActive,
  type VideoUploadState,
} from './videoUploadState';
import type { VideoUploadTransport } from './videoUploadTypes';
import { beginVideoUpload } from './beginVideoUpload';
import { compressThenUpload } from './compressThenUpload';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import { canCompressVideo, compressVideo } from './compressVideo';
import { useScreenWakeLock } from './useScreenWakeLock';
import { realSleep, useUploadPause } from './useUploadPause';

export interface UseVideoUploadOptions<TResult extends object> {
  /** Собирает транспорт на каждый выбор файла — так он видит актуальные
   * `attemptId`/`itemId`. */
  createTransport: () => VideoUploadTransport<TResult>;
  /** Готовый результат — кладёт его на экран без второго GET
   * (ADR-0087). */
  onDone: (result: TResult) => void;
  /** Потолок размера и текст отказа у каждого вида видео свой. */
  maxBytes: number;
  tooLargeMessage: string;
  sleep?: (ms: number) => Promise<void>;
  /** `false` — без сжатия: сжатие часа видео держит результат в памяти вкладки
   * (запись занятия, ADR-0180). */
  canCompress?: boolean;
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
  /** «Отправить без сжатия»: обрывает сжатие и грузит исходный файл. Вне фазы
   * сжатия ничего не делает. */
  skipCompression: () => void;
  /** Обрывает загрузку и забывает всё, что она оставила на экране — ошибку или
   * «отменено»: «Убрать видео» не должно оставлять за собой старую ошибку. */
  reset: () => void;
}

export function useVideoUpload<TResult extends object>({
  createTransport,
  onDone,
  maxBytes,
  tooLargeMessage,
  sleep = realSleep,
  canCompress = true,
  compress = compressVideo,
}: UseVideoUploadOptions<TResult>): UseVideoUploadResult {
  const [state, setState] = useState<VideoUploadState>(IDLE_VIDEO_UPLOAD_STATE);
  // Пока видео в работе — экран не гаснет (iOS усыпляет страницу, ADR-0165) и
  // закрытие вкладки браузер переспросит: так у всех видов видео.
  const isActive = isVideoUploadActive(state);
  useScreenWakeLock(isActive);
  useWarnBeforeUnload(isActive);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const skipRef = useRef<(() => void) | null>(null);

  const markWaiting = useCallback(
    () => setState((prev) => ({ ...prev, phase: 'waiting' })),
    [],
  );
  // Размонтирование загрузку не обрывает (аудит 2026-10-01, F04): «Отправить»
  // переключает экран, части идут дальше, результат придёт через onDone.
  const { waitForResume, release } = useUploadPause(sleep, markWaiting);

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    release();
    setState((prev) =>
      prev.phase === 'idle' || prev.phase === 'done'
        ? prev
        : { ...prev, phase: 'cancelled', error: null, canSkipCompression: false },
    );
  }, [release]);

  const selectFile = useCallback(
    (file: File) => {
      runIdRef.current += 1;
      const thisRun = runIdRef.current;
      controllerRef.current?.abort();
      skipRef.current = null;
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

      // Без сжатия: beginVideoUpload сам ставит `uploading` или отказ по размеру.
      if (!canCompress || !canCompressVideo(file.size)) {
        upload(file);
        return;
      }
      skipRef.current = compressThenUpload({
        file,
        signal: controller.signal,
        isCancelled,
        compress,
        maxBytes,
        setState,
        upload,
      });
    },
    [
      createTransport,
      onDone,
      maxBytes,
      tooLargeMessage,
      waitForResume,
      canCompress,
      compress,
    ],
  );

  const reset = useCallback(() => {
    cancel();
    setState(IDLE_VIDEO_UPLOAD_STATE);
  }, [cancel]);

  const skipCompression = useCallback(() => skipRef.current?.(), []);

  return { state, selectFile, cancel, resumeNow: release, skipCompression, reset };
}
