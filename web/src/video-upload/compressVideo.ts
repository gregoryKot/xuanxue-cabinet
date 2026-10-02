// Сжатие видео в браузере перед загрузкой (ADR-0165): MP4 с H.264, кадр до
// 1280×720, около 2 Мбит/с, индекс в начале файла. Библиотека Mediabunny
// (WebCodecs + разбор и сборка MP4) грузится отдельным куском только здесь —
// на стартовую страницу она не попадает. Сжатие — оптимизация, а не условие:
// что бы ни пошло не так, уходит исходный файл.
import type * as Mediabunny from 'mediabunny';
import {
  isWorthCompressing,
  planVideoCompression,
  shouldUseCompressed,
  type VideoCompressionTarget,
} from './videoCompressionPlan';

export type MediabunnyLibrary = typeof Mediabunny;

const OUTPUT_MIME_TYPE = 'video/mp4';
const OUTPUT_VIDEO_CODEC = 'avc';
/** Сколько пакетов читаем, чтобы прикинуть частоту кадров: хватает на оценку,
 * а весь файл просматривать незачем. */
const FRAME_RATE_SAMPLE_PACKETS = 60;

export interface CompressVideoOptions {
  signal: AbortSignal;
  /** Доля готовности 0..1. */
  onProgress: (fraction: number) => void;
  /** Подмена в тестах; по умолчанию — ленивый кусок с библиотекой. */
  loadLibrary?: () => Promise<MediabunnyLibrary>;
}

/** Стоит ли вообще браться за файл: в браузере есть кодировщик WebCodecs и файл
 * не такой маленький, чтобы уйти одной частью. Решается до загрузки библиотеки,
 * поэтому не стоит ни байта трафика, и экран не мигает «Сжимаем». */
export function canCompressVideo(sizeBytes: number): boolean {
  return typeof VideoEncoder !== 'undefined' && isWorthCompressing(sizeBytes);
}

// Отмена — не ошибка: хук по ней молча выходит. Текст человеку не показывается.
function abortError(): DOMException {
  return new DOMException('Сжатие отменено.', 'AbortError');
}

async function probeTarget(
  input: InstanceType<MediabunnyLibrary['Input']>,
  sizeBytes: number,
): Promise<VideoCompressionTarget | null> {
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const [displayWidth, displayHeight, stats] = await Promise.all([
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.computePacketStats(FRAME_RATE_SAMPLE_PACKETS),
  ]);
  return planVideoCompression({
    sizeBytes,
    displayWidth,
    displayHeight,
    frameRate: stats.averagePacketRate,
  });
}

async function convert(
  file: File,
  options: Required<Omit<CompressVideoOptions, 'loadLibrary'>>,
  lib: MediabunnyLibrary,
): Promise<Blob | null> {
  const { signal, onProgress } = options;
  signal.throwIfAborted();
  const input = new lib.Input({
    source: new lib.BlobSource(file),
    formats: lib.ALL_FORMATS,
  });
  try {
    const target = await probeTarget(input, file.size);
    if (!target) return null;

    const bufferTarget = new lib.BufferTarget();
    const output = new lib.Output({
      format: new lib.Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: bufferTarget,
    });
    // Звук не трогаем: AAC с телефона копируется как есть, а кодировщика AAC в
    // Safari может не быть. Дорожка, которую не получилось сохранить, — повод
    // отдать исходник: голос учителя молча терять нельзя.
    const conversion = await lib.Conversion.init({
      input,
      output,
      video: {
        codec: OUTPUT_VIDEO_CODEC,
        width: target.width,
        height: target.height,
        fit: 'fill',
        quality: new lib.Quality({ bitrate: target.bitrate }),
        ...(target.frameRate ? { frameRate: target.frameRate } : {}),
      },
    });
    if (!conversion.isValid || conversion.discardedTracks.length > 0) return null;

    conversion.onProgress = onProgress;
    const cancel = () => void conversion.cancel();
    signal.throwIfAborted();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal.removeEventListener('abort', cancel);
    }
    const { buffer } = bufferTarget;
    return buffer ? new Blob([buffer], { type: OUTPUT_MIME_TYPE }) : null;
  } finally {
    input.dispose();
  }
}

/** Сжатый файл или исходник; промис отвергается только отменой (`AbortError`). */
export async function compressVideo(
  file: File,
  options: CompressVideoOptions,
): Promise<Blob> {
  const { signal, onProgress, loadLibrary = () => import('mediabunny') } = options;
  if (!canCompressVideo(file.size)) return file;
  try {
    const compressed = await convert(file, { signal, onProgress }, await loadLibrary());
    return compressed && shouldUseCompressed(file.size, compressed.size)
      ? compressed
      : file;
  } catch {
    if (signal.aborted) throw abortError();
    return file;
  }
}
