// Загрузка видео-ответа частями (ADR-0137) — состояние конкретного
// видео-вопроса: AttemptVideoUpload.tsx заводит свой экземпляр хука на
// каждый вопрос, поэтому два видео-вопроса одной попытки прогрессируют
// независимо без Map по itemId. Сам сквозной прогон (старт → части →
// complete, повтор, отмена) — answerVideoUploadRunner.ts, здесь только React
// state machine поверх него: idle → uploading → waiting (пауза перед
// повтором) → done | failed | cancelled.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ANSWER_VIDEO_LIMITS, type ExamMediaDto } from '@xuanxue/shared';
import type { FormError } from '../components/FormServerError';
import { checkAnswerVideoFileSize } from './answerVideoUpload';
import {
  runAnswerVideoUpload,
  type AnswerVideoUploadProgress,
} from './answerVideoUploadRunner';

type AnswerVideoUploadPhase =
  'idle' | 'uploading' | 'waiting' | 'cancelled' | 'done' | 'failed';

export interface AnswerVideoUploadState {
  phase: AnswerVideoUploadPhase;
  /** Число частей, уже принятых сервером — не байт: сырой `PUT` без XHR не
   * даёт промежуточного прогресса внутри одной части (answerVideoUpload.ts). */
  sentParts: number;
  partCount: number;
  totalBytes: number;
  partBytes: number;
  /** Только `phase: 'failed'` — текст сервера или общий запасной. */
  error: FormError | null;
}

const IDLE_STATE: AnswerVideoUploadState = {
  phase: 'idle',
  sentParts: 0,
  partCount: 0,
  totalBytes: 0,
  partBytes: 0,
  error: null,
};

/** Настоящая пауза — по умолчанию; тесты подставляют свою без реальных
 * таймеров (CLAUDE.md «Детерминизм»). */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseAnswerVideoUploadOptions {
  attemptId: string;
  itemId: string;
  /** Кладёт готовый `ExamMediaDto` в попытку без второго GET
   * (useAttempt.ts, ADR-0087) — `AttemptVideoControls.applyMedia`. */
  applyMedia: (media: ExamMediaDto) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface UseAnswerVideoUploadResult {
  state: AnswerVideoUploadState;
  /** Выбор (или повторный выбор того же) файла — начинает или продолжает
   * загрузку с первой недостающей части (сервер помнит принятые). */
  selectFile: (file: File) => void;
  /** Обрывает текущие запросы локально; на сервере загрузка остаётся —
   * выбор того же файла снова продолжит её (ADR-0137). */
  cancel: () => void;
  /** «Продолжить сейчас» — не ждать таймера паузы. */
  resumeNow: () => void;
}

export function useAnswerVideoUpload({
  attemptId,
  itemId,
  applyMedia,
  sleep = realSleep,
}: UseAnswerVideoUploadOptions): UseAnswerVideoUploadResult {
  const [state, setState] = useState<AnswerVideoUploadState>(IDLE_STATE);
  const runIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);

  const releaseWait = useCallback(() => {
    resumeRef.current?.();
    resumeRef.current = null;
  }, []);

  useEffect(() => {
    // Сеть вернулась — продолжаем сами, не дожидаясь таймера паузы (ADR-0137).
    window.addEventListener('online', releaseWait);
    return () => {
      window.removeEventListener('online', releaseWait);
      controllerRef.current?.abort();
    };
  }, [releaseWait]);

  const waitForResume = useCallback(
    (delaySec: number) => {
      setState((prev) => ({ ...prev, phase: 'waiting' }));
      return new Promise<void>((resolve) => {
        resumeRef.current = resolve;
        void sleep(delaySec * 1000).then(resolve);
      });
    },
    [sleep],
  );

  const cancel = useCallback(() => {
    runIdRef.current += 1;
    controllerRef.current?.abort();
    releaseWait();
    setState((prev) =>
      prev.phase === 'idle' || prev.phase === 'done'
        ? prev
        : { ...prev, phase: 'cancelled', error: null },
    );
  }, [releaseWait]);

  const resumeNow = useCallback(() => releaseWait(), [releaseWait]);

  const selectFile = useCallback(
    (file: File) => {
      const sizeError = checkAnswerVideoFileSize(file.size);
      if (sizeError) {
        setState({ ...IDLE_STATE, phase: 'failed', error: { message: sizeError } });
        return;
      }

      runIdRef.current += 1;
      const thisRun = runIdRef.current;
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCancelled = () => runIdRef.current !== thisRun || controller.signal.aborted;

      setState({
        phase: 'uploading',
        sentParts: 0,
        partCount: 0,
        totalBytes: file.size,
        partBytes: ANSWER_VIDEO_LIMITS.partBytes,
        error: null,
      });

      // Колбэки без своей проверки isCancelled(): runner (answerVideoUploadRunner.ts)
      // уже сверяет её синхронно перед каждым вызовом — второй раз то же самое
      // значение здесь не изменится, а мёртвая ветка только путает читателя
      // (CLAUDE.md «Дубли и мёртвый код»).
      void runAnswerVideoUpload({
        attemptId,
        itemId,
        file,
        signal: controller.signal,
        isCancelled,
        onProgress: (progress: AnswerVideoUploadProgress) => {
          setState({
            phase: 'uploading',
            sentParts: progress.sentParts,
            partCount: progress.partCount,
            totalBytes: file.size,
            partBytes: progress.partBytes,
            error: null,
          });
        },
        waitForResume,
        onFailed: (error) => {
          setState((prev) => ({ ...prev, phase: 'failed', error }));
        },
        onDone: (media) => {
          applyMedia(media);
          setState({ ...IDLE_STATE, phase: 'done' });
        },
      });
    },
    [attemptId, itemId, applyMedia, waitForResume],
  );

  return { state, selectFile, cancel, resumeNow };
}
