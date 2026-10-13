// Основной путь снимка кадра: Mediabunny читает MP4/MOV/WebM сам и отдаёт кадр
// нужной секунды, уже уменьшенный и с учётом поворота из метаданных (ADR-0165).
// Не зависит от того, умеет ли `<video>` браузера этот кодек — только от
// `VideoDecoder`. Источник — Blob (загрузка) или адрес со своего домена
// (ADR-0182: старые видео читаются по `Range` из кабинета). Тот же ленивый кусок, что у сжатия (compressVideo.ts).
import type { MediabunnyLibrary } from './compressVideo';
import { posterSeekTime, posterSize, type PosterSource } from './videoPosterPlan';
import type { PosterCanvas } from './posterEncode';

// Кадр лежит в первой секунде: кэшировать весь файл (по умолчанию 64 МиБ)
// незачем, хватает индекса и первых кусков (ADR-0182).
const URL_SOURCE_CACHE_BYTES = 16 * 1024 * 1024;
// Библиотека по умолчанию повторяет упавший запрос без конца; а у нас снимок
// ограничен по времени, и брошенный по сроку повтор крутился бы в фоне вечно.
const URL_SOURCE_MAX_RETRIES = 2;
const URL_SOURCE_RETRY_DELAY_SEC = 1;

function openSource(source: PosterSource, lib: MediabunnyLibrary) {
  if (typeof source !== 'string') return new lib.BlobSource(source);
  return new lib.UrlSource(source, {
    maxCacheSize: URL_SOURCE_CACHE_BYTES,
    getRetryDelay: (previousAttempts) =>
      previousAttempts < URL_SOURCE_MAX_RETRIES ? URL_SOURCE_RETRY_DELAY_SEC : null,
  });
}

/** Холст с кадром или `null`: дорожки нет, кодек не декодируется, размеры не
 * прочитались или кадра на этой секунде нет. */
export async function posterFromLibrary(
  source: PosterSource,
  lib: MediabunnyLibrary,
): Promise<PosterCanvas | null> {
  const input = new lib.Input({
    source: openSource(source, lib),
    formats: lib.ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track || !(await track.canDecode())) return null;
    const [displayWidth, displayHeight, first, duration] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getFirstTimestamp(),
      track.getDurationFromMetadata(),
    ]);
    const size = posterSize(displayWidth, displayHeight);
    if (!size) return null;
    const sink = new lib.CanvasSink(track, { ...size, fit: 'fill' });
    const frame = await sink.getCanvas(first + posterSeekTime(duration));
    return frame?.canvas ?? null;
  } finally {
    input.dispose();
  }
}
