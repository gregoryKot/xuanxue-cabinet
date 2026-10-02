// Основной путь снимка кадра: Mediabunny читает MP4/MOV/WebM сам и отдаёт кадр
// нужной секунды, уже уменьшенный и с учётом поворота из метаданных (ADR-0165).
// Не зависит от того, умеет ли `<video>` браузера этот кодек — только от
// `VideoDecoder`. Тот же ленивый кусок, что у сжатия (compressVideo.ts).
import type { MediabunnyLibrary } from './compressVideo';
import { posterSeekTime, posterSize } from './videoPosterPlan';
import type { PosterCanvas } from './posterEncode';

/** Холст с кадром или `null`: дорожки нет, кодек не декодируется, размеры не
 * прочитались или кадра на этой секунде нет. */
export async function posterFromLibrary(
  blob: Blob,
  lib: MediabunnyLibrary,
): Promise<PosterCanvas | null> {
  const input = new lib.Input({
    source: new lib.BlobSource(blob),
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
