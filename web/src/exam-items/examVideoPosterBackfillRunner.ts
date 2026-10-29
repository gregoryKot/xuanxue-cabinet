// Один прогон «Снять кадры» (ADR-0182): список видео без кадра → по одному
// снимок из байтов через кабинет → запись кадра. Не React и не знает маршрутов
// (их подставляет хук) — тестируется без DOM, по образцу video-upload/
// videoUploadRunner.ts. Ошибка одного видео не останавливает остальные: кадр —
// украшение, а не условие просмотра; останавливает только отказ в доступе, потому
// что остальные запросы получат тот же отказ.
import { isNoAccess, nextPendingBatch } from './examVideoBackfillBatch';

const NO_ACCESS_MESSAGE =
  'Нет доступа. Войдите заново под учётной записью **учителя или админа** и нажмите «Снять кадры» ещё раз.';
const LIST_FAILED_MESSAGE =
  'Список видео не загрузился. Проверьте связь и нажмите «Снять кадры» ещё раз: **снятые кадры сохранены**.';
const FAILURE_MESSAGES = { noAccess: NO_ACCESS_MESSAGE, listFailed: LIST_FAILED_MESSAGE };

export interface PosterBackfillProgress {
  /** Кадров снято и записано. */
  done: number;
  /** Видео, с которых кадр не снялся или не записался: остаются без кадра. */
  failed: number;
  /** Сколько видео ждали кадра в начале; `null`, пока неизвестно. */
  total: number | null;
}

export interface PosterBackfillRunResult extends PosterBackfillProgress {
  /** Текст для человека, если прогон оборвался; `null` — дошёл до конца. */
  error: string | null;
  /** Отменён сигналом — состояние экрана уже не нужно. */
  cancelled: boolean;
}

export interface RunPosterBackfillParams {
  signal: AbortSignal;
  /** Число из сводки раздела; без него итог — длина первой пачки. */
  total: number | null;
  /** Следующая пачка видео без кадра (`GET /exam-videos/without-poster`). */
  listWithoutPoster: (signal: AbortSignal) => Promise<{ id: string }[]>;
  /** JPEG кадра в base64 или `null` (captureVideoPoster, не бросает). */
  capture: (videoId: string, signal: AbortSignal) => Promise<string | null>;
  /** Запись кадра (`PUT /exam-videos/:id/poster`). */
  savePoster: (videoId: string, poster: string, signal: AbortSignal) => Promise<void>;
  onProgress: (progress: PosterBackfillProgress) => void;
}

export async function runPosterBackfill(
  params: RunPosterBackfillParams,
): Promise<PosterBackfillRunResult> {
  const { signal, listWithoutPoster, capture, savePoster, onProgress } = params;
  let { total } = params;
  let done = 0;
  let failed = 0;
  // Уже тронутые в этом прогоне: список без смещения отдаёт ту же голову, пока
  // кадр не записан, и без этого фильтра не снявшиеся видео крутились бы по кругу.
  // Оборотная сторона: если первая пачка (VIDEOS_WITHOUT_POSTER_BATCH) целиком
  // не снялась, до остальных видео этот прогон не дойдёт.
  const handled = new Set<string>();

  const snapshot = (): PosterBackfillProgress => ({ done, failed, total });
  const finish = (error: string | null, cancelled = false): PosterBackfillRunResult => ({
    ...snapshot(),
    error,
    cancelled,
  });

  while (!signal.aborted) {
    const next = await nextPendingBatch(
      listWithoutPoster,
      handled,
      signal,
      FAILURE_MESSAGES,
    );
    if (next.status === 'cancelled') break;
    if (next.status === 'done') return finish(null);
    if (next.status === 'failed') return finish(next.message);
    total ??= next.ids.length;

    // Отмена проверяется после каждого шага, который её ждал (снимок, запись):
    // между шагами она прийти не может, прогресс отдаётся синхронно.
    for (const id of next.ids) {
      handled.add(id);
      const poster = await capture(id, signal);
      if (signal.aborted) return finish(null, true);
      if (poster === null) {
        failed += 1;
      } else {
        try {
          await savePoster(id, poster, signal);
          done += 1;
        } catch (error) {
          if (signal.aborted) return finish(null, true);
          if (isNoAccess(error)) return finish(NO_ACCESS_MESSAGE);
          failed += 1;
        }
      }
      total = Math.max(total, done + failed);
      onProgress(snapshot());
    }
  }
  return finish(null, true);
}
