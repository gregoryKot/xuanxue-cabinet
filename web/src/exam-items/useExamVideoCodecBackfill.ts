// Кнопка «Перегнать видео» раздела «Экзамены» (ADR-0189): React-обвязка вокруг
// прогона (examVideoCodecBackfillRunner.ts) по образцу «Снять кадры»
// (useExamVideoPosterBackfill.ts). Кодек читается и видео перегоняется в браузере
// штата, поэтому прогон жив, пока открыта вкладка: экран не гаснет, закрытие
// вкладки браузер переспросит, уход с экрана обрывает прогон.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRoute } from '../api/apiRoute';
import { UPLOAD_TIMEOUT_MS } from '../api/http';
import { useWarnBeforeUnload } from '../hooks/useWarnBeforeUnload';
import { useScreenWakeLock } from '../video-upload/useScreenWakeLock';
import { realSleep, useUploadPause } from '../video-upload/useUploadPause';
import { makeCodecBackfillDeps } from './examVideoCodecBackfillDeps';
import { runCodecBackfill } from './examVideoCodecBackfillRunner';
import type { CodecBackfillView } from './examVideoCodecBackfillText';

const IDLE_STATE: CodecBackfillView = {
  phase: 'idle',
  converted: 0,
  alreadyH264: 0,
  failed: 0,
  total: null,
  error: null,
};

export interface UseExamVideoCodecBackfillOptions {
  /** Прогон кончился (в том числе остановкой): экран перечитывает сводку, чтобы
   * число «ждут перегона» стало настоящим. Отмена при уходе с экрана не зовёт. */
  onFinished: () => void | Promise<void>;
}

export interface UseExamVideoCodecBackfillResult {
  state: CodecBackfillView;
  /** `total` — число из сводки раздела (`codecPendingCount`); без него итог
   * считается по первой пачке. */
  start: (total: number | null) => void;
}

function noop(): void {}

export function useExamVideoCodecBackfill({
  onFinished,
}: UseExamVideoCodecBackfillOptions): UseExamVideoCodecBackfillResult {
  const [state, setState] = useState<CodecBackfillView>(IDLE_STATE);
  const controller = useRef<AbortController | null>(null);
  // Второе нажатие во время прогона ничего не запускает: два прогона по одному
  // списку перегоняли бы одни и те же видео дважды.
  const isRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });
  const isActive = state.phase === 'running';
  useScreenWakeLock(isActive);
  useWarnBeforeUnload(isActive);
  // Загрузка копии повторяется на сбой сети тем же расписанием, что у формы.
  const { waitForResume, release } = useUploadPause(realSleep, noop);

  useEffect(
    () => () => {
      controller.current?.abort();
      release();
    },
    [release],
  );

  const start = useCallback(
    (total: number | null) => {
      if (isRunning.current) return;
      const own = new AbortController();
      controller.current = own;
      isRunning.current = true;
      setState({ ...IDLE_STATE, phase: 'running', total });
      void runCodecBackfill({
        signal: own.signal,
        total,
        listPending: (signal) => apiRoute('GET /exam-videos/codec-pending', { signal }),
        ...makeCodecBackfillDeps(waitForResume),
        markCodec: async (id, codec, signal) => {
          await apiRoute('PUT /exam-videos/:id/codec', {
            params: { id },
            body: { codec },
            signal,
          });
        },
        replace: async (id, replacementId, signal) => {
          await apiRoute('POST /exam-videos/:id/replace', {
            params: { id },
            body: { replacementId },
            signal,
            timeoutMs: UPLOAD_TIMEOUT_MS,
          });
        },
        onProgress: (progress) =>
          setState({ ...IDLE_STATE, ...progress, phase: 'running' }),
      }).then(
        ({ cancelled, error, converted, alreadyH264, failed, total: finalTotal }) => {
          isRunning.current = false;
          if (cancelled) return;
          setState({
            phase: 'done',
            converted,
            alreadyH264,
            failed,
            total: finalTotal,
            error,
          });
          void onFinishedRef.current();
        },
      );
    },
    [waitForResume],
  );

  return { state, start };
}
