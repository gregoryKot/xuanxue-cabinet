// Запасной путь снимка кадра: немой `<video>` с адресом из объекта Blob, перемотка
// на нужную секунду и `drawImage` на холст (ADR-0165). Нужен там, где нет
// WebCodecs для Mediabunny (старый Safari), и там, где свой декодер умеет то,
// чего нет у библиотеки. Любое событие `error` или отмена — выход без кадра;
// адрес объекта и элемент освобождаются в любом случае.
import { posterSeekTime, posterSize, type PosterSource } from './videoPosterPlan';
import type { PosterCanvas } from './posterEncode';

/** Ждёт событие `eventName` у цели; `error` цели или отмена сигнала — отказ. */
function waitForEvent(
  target: EventTarget,
  eventName: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, onDone);
      target.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
    };
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('видео не открылось'));
    };
    const onAbort = () => {
      cleanup();
      reject(new Error('снимок кадра прерван'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    target.addEventListener(eventName, onDone);
    target.addEventListener('error', onError);
    signal.addEventListener('abort', onAbort);
  });
}

/** Есть ли чем снимать запасным путём: Blob нужен адрес объекта, а в окружении
 * без него (и без `document`) пробовать нечего. Адрес со своего домена
 * (ADR-0182) элементу годится как есть — нужен только `document`. */
export function canCaptureFromVideoElement(source: PosterSource): boolean {
  if (typeof document === 'undefined') return false;
  return typeof source === 'string' || typeof URL.createObjectURL === 'function';
}

/** Холст с кадром или `null`, если снять не вышло (нет размеров, нет 2D). */
export async function posterFromVideoElement(
  source: PosterSource,
  signal: AbortSignal,
): Promise<PosterCanvas | null> {
  // Свой адрес освобождать нечем: объекта в памяти страницы за ним нет.
  const objectUrl = typeof source === 'string' ? null : URL.createObjectURL(source);
  const url = objectUrl ?? (source as string);
  const video = document.createElement('video');
  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await waitForEvent(video, 'loadeddata', signal);
    video.currentTime = posterSeekTime(video.duration);
    await waitForEvent(video, 'seeked', signal);

    const size = posterSize(video.videoWidth, video.videoHeight);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!size || !context) return null;
    canvas.width = size.width;
    canvas.height = size.height;
    context.drawImage(video, 0, 0, size.width, size.height);
    return canvas;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    // Снять источник и перечитать элемент — иначе браузер держит декодер.
    video.removeAttribute('src');
    video.load();
  }
}
