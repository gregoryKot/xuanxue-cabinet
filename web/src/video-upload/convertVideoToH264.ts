// Перегон старого видео в H.264 для кнопки «Перегнать видео» (ADR-0189). Оригинал
// заменяется копией, поэтому недостаточно, что перегон «получился»: копию ещё раз
// открываем библиотекой и сверяем с оригиналом. Любой сбой и любое расхождение —
// `null`, и оригинал остаётся как был. Сам перегон — compressVideo.ts, тот же
// путь, что при загрузке (ADR-0165, ADR-0188).
import { H264_VIDEO_CODEC } from '@xuanxue/shared';
import { compressVideo, canCompressVideo, type MediabunnyLibrary } from './compressVideo';
import { isDurationPreserved } from './videoCompressionPlan';

export interface ConvertVideoToH264Options {
  signal: AbortSignal;
  /** Подмена в тестах; по умолчанию — ленивый кусок с библиотекой. */
  loadLibrary?: () => Promise<MediabunnyLibrary>;
}

interface VideoFacts {
  /** Конец самой длинной дорожки, секунды. */
  duration: number;
  /** Кодек первой видеодорожки; `null` — дорожки нет. */
  videoCodec: string | null;
}

async function readFacts(video: Blob, lib: MediabunnyLibrary): Promise<VideoFacts> {
  const input = new lib.Input({
    source: new lib.BlobSource(video),
    formats: lib.ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    return {
      duration: await input.computeDuration(),
      videoCodec: track ? await track.getCodec() : null,
    };
  } finally {
    input.dispose();
  }
}

/** Копия настоящая: первая видеодорожка в H.264 и длина как у оригинала.
 * Сохранность всех дорожек проверяет сам перегон (compressVideo.ts). Не
 * прочиталась хоть одна из двух — копию не принимаем. */
async function isFaithfulCopy(
  source: Blob,
  copy: Blob,
  lib: MediabunnyLibrary,
): Promise<boolean> {
  try {
    const [original, converted] = await Promise.all([
      readFacts(source, lib),
      readFacts(copy, lib),
    ]);
    return (
      converted.videoCodec === H264_VIDEO_CODEC &&
      isDurationPreserved(original.duration, converted.duration)
    );
  } catch {
    return false;
  }
}

/** Проверенная копия в H.264 или `null`: нет кодировщика, нечем прочитать
 * исходник, перегон потерял дорожку, копия не в H.264 или другой длины.
 * Промис отвергается только отменой (`AbortError`). */
export async function convertVideoToH264(
  source: Blob,
  options: ConvertVideoToH264Options,
): Promise<Blob | null> {
  const { signal, loadLibrary = () => import('mediabunny') } = options;
  if (!canCompressVideo()) return null;
  let lib: MediabunnyLibrary;
  try {
    lib = await loadLibrary();
  } catch {
    return null;
  }
  const { file } = await compressVideo(source, {
    signal,
    onProgress: () => undefined,
    loadLibrary: () => Promise.resolve(lib),
  });
  if (file === source) return null;
  return (await isFaithfulCopy(source, file, lib)) ? file : null;
}
