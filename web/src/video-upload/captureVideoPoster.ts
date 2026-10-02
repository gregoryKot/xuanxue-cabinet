// Кадр-превью видео, которое сейчас уходит на сервер (ADR-0165): браузер снимает
// его сам из того, что действительно грузится (сжатый файл или исходник), и
// отдаёт в `complete`; плеер показывает кадр до нажатия. Украшение, а не
// условие: что бы ни пошло не так, итог `null`, загрузка идёт и кончается без
// кадра. Сначала Mediabunny (нужен `VideoDecoder`), потом запасной `<video>`.
// Весь снимок ограничен по времени: на iOS `seeked` без жеста может не прийти.
import { combineAbortSignals } from '../api/abortSignals';
import type { MediabunnyLibrary } from './compressVideo';
import { encodePoster, type PosterCanvas } from './posterEncode';
import { posterFromLibrary } from './posterFromLibrary';
import {
  canCaptureFromVideoElement,
  posterFromVideoElement,
} from './posterFromVideoElement';
import { POSTER_TIMEOUT_MS } from './videoPosterPlan';

export interface CapturePosterOptions {
  /** Загрузку отменили — снимок бросаем. */
  signal?: AbortSignal;
  /** Подмена в тестах; по умолчанию — ленивый кусок с библиотекой. */
  loadLibrary?: () => Promise<MediabunnyLibrary>;
}

/** Промис отказывает, когда сигнал отменён, — на нём «ограничиваем по времени»
 * шаги, которые сами отменять не умеют (декодер библиотеки). Брошенный шаг
 * доработает в фоне и сам освободит ресурсы в своём `finally`. */
function untilAborted<T>(step: Promise<T>, signal: AbortSignal): Promise<T> {
  // Брошенный шаг может отказать уже после нас — его поздний отказ никому не
  // нужен и не должен остаться необработанным.
  step.catch(() => undefined);
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error('снимок кадра прерван'));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    step
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort));
  });
}

async function findFrame(
  blob: Blob,
  signal: AbortSignal,
  loadLibrary: () => Promise<MediabunnyLibrary>,
): Promise<PosterCanvas | null> {
  if (typeof VideoDecoder !== 'undefined') {
    const fromLibrary = await untilAborted(
      loadLibrary().then((lib) => posterFromLibrary(blob, lib)),
      signal,
    ).catch(() => null);
    if (fromLibrary) return fromLibrary;
  }
  if (!canCaptureFromVideoElement()) return null;
  return untilAborted(posterFromVideoElement(blob, signal), signal);
}

/** JPEG кадра в base64 (без `data:`) или `null`. Не бросает. */
export async function captureVideoPoster(
  blob: Blob,
  options: CapturePosterOptions = {},
): Promise<string | null> {
  const { signal: outer, loadLibrary = () => import('mediabunny') } = options;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), POSTER_TIMEOUT_MS);
  const signal = combineAbortSignals(
    outer ? [outer, deadline.signal] : [deadline.signal],
  );
  try {
    const canvas = await findFrame(blob, signal, loadLibrary);
    return canvas ? await untilAborted(encodePoster(canvas), signal) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
