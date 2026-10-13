// Кнопка «Снять кадры» раздела «Экзамены» (ADR-0182): React-обвязка вокруг
// прогона (examVideoPosterBackfillRunner.ts). Снимок идёт в браузере штата из
// байтов, которые отдаёт кабинет со своего домена, — поэтому прогон жив, пока
// открыта вкладка, и обрывается при уходе с экрана.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRoute } from '../api/apiRoute';
import { examVideoBytesSrc } from '../api/examVideoPaths';
import { captureVideoPoster } from '../video-upload/captureVideoPoster';
import { POSTER_FROM_URL_TIMEOUT_MS } from '../video-upload/videoPosterPlan';
import { runPosterBackfill } from './examVideoPosterBackfillRunner';
import type { PosterBackfillView } from './examVideoPosterBackfillText';

const IDLE_STATE: PosterBackfillView = {
  phase: 'idle',
  done: 0,
  failed: 0,
  total: null,
  error: null,
};

export interface UseExamVideoPosterBackfillOptions {
  /** Прогон кончился (в том числе остановкой): экран перечитывает сводку, чтобы
   * число «без кадра» стало настоящим. Отмена при уходе с экрана не зовёт. */
  onFinished: () => void;
  /** Подмена в тестах: настоящий снимок ждёт декодера и до срока держит тест. */
  capture?: typeof captureVideoPoster;
}

export interface UseExamVideoPosterBackfillResult {
  state: PosterBackfillView;
  /** `total` — число из сводки раздела (`withoutPosterCount`); без него итог
   * считается по первой пачке. */
  start: (total: number | null) => void;
}

export function useExamVideoPosterBackfill({
  onFinished,
  capture = captureVideoPoster,
}: UseExamVideoPosterBackfillOptions): UseExamVideoPosterBackfillResult {
  const [state, setState] = useState<PosterBackfillView>(IDLE_STATE);
  const controller = useRef<AbortController | null>(null);
  // Второе нажатие во время прогона ничего не запускает: два прогона по одному
  // списку снимали бы одни и те же видео дважды.
  const isRunning = useRef(false);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  const start = useCallback(
    (total: number | null) => {
      if (isRunning.current) return;
      const own = new AbortController();
      controller.current = own;
      isRunning.current = true;
      setState({ ...IDLE_STATE, phase: 'running', total });
      void runPosterBackfill({
        signal: own.signal,
        total,
        listWithoutPoster: (signal) =>
          apiRoute('GET /exam-videos/without-poster', { signal }),
        capture: (id, signal) =>
          capture(examVideoBytesSrc(id), {
            signal,
            timeoutMs: POSTER_FROM_URL_TIMEOUT_MS,
          }),
        savePoster: async (id, poster, signal) => {
          await apiRoute('PUT /exam-videos/:id/poster', {
            params: { id },
            body: { poster },
            signal,
          });
        },
        onProgress: (progress) =>
          setState({ ...IDLE_STATE, ...progress, phase: 'running' }),
      }).then(({ cancelled, error, done, failed, total: finalTotal }) => {
        isRunning.current = false;
        if (cancelled) return;
        setState({ phase: 'done', done, failed, total: finalTotal, error });
        onFinishedRef.current();
      });
    },
    [capture],
  );

  return { state, start };
}
