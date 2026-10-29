// Сжатие видео в браузере перед загрузкой (ADR-0165): MP4 с H.264, кадр до
// 1280×720, около 2 Мбит/с, индекс в начале файла. Видео не в H.264 (HEVC с
// iPhone и т. п.) перегоняется всегда, каким бы маленьким оно ни было, —
// иначе у части зрителей оно не откроется (ADR-0188). Библиотека Mediabunny
// (WebCodecs + разбор и сборка MP4) грузится отдельным куском только здесь —
// на стартовую страницу она не попадает. Перегон — оптимизация и забота о
// совместимости, а не условие: что бы ни пошло не так, уходит исходный файл.
import type * as Mediabunny from 'mediabunny';
import {
  canSkipConversion,
  planVideoCompression,
  shouldConvertSource,
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
  /** Кодек прочитан и перегон решено делать (маленький H.264 до этого не
   * доходит). `canSkip: false` — исходник отдавать нельзя: он не H.264 и у части
   * зрителей не откроется, поэтому «Отправить без сжатия» не предлагается
   * (ADR-0188). */
  onConversionStart?: (info: { canSkip: boolean }) => void;
  /** Подмена в тестах; по умолчанию — ленивый кусок с библиотекой. */
  loadLibrary?: () => Promise<MediabunnyLibrary>;
}

/** Есть ли в браузере кодировщик WebCodecs. Размер файла здесь не смотрим:
 * маленькому HEVC перегон нужен ради совместимости, а кодек узнаётся только
 * библиотекой (ADR-0188). Без кодировщика библиотеку не грузим вовсе. */
export function canCompressVideo(): boolean {
  return typeof VideoEncoder !== 'undefined';
}

// Отмена — не ошибка: хук по ней молча выходит. Текст человеку не показывается.
function abortError(): DOMException {
  return new DOMException('Сжатие отменено.', 'AbortError');
}

async function probeTarget(
  track: Mediabunny.InputVideoTrack,
  sizeBytes: number,
): Promise<VideoCompressionTarget | null> {
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

/** Результат перегона, который стоит взять вместо исходника, или `null` —
 * отдавать исходник: сжимать нечем или незачем, либо результат хуже. */
async function convert(
  file: File,
  options: Omit<CompressVideoOptions, 'loadLibrary'>,
  lib: MediabunnyLibrary,
): Promise<Blob | null> {
  const { signal, onProgress, onConversionStart } = options;
  signal.throwIfAborted();
  const input = new lib.Input({
    source: new lib.BlobSource(file),
    formats: lib.ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const codec = await track.getCodec();
    // Маленький H.264 остаётся как есть: он уходит одной частью (ADR-0165).
    if (!shouldConvertSource(file.size, codec)) return null;
    onConversionStart?.({ canSkip: canSkipConversion(codec) });
    const target = await probeTarget(track, file.size);
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
    if (!buffer) return null;
    const converted = new Blob([buffer], { type: OUTPUT_MIME_TYPE });
    return shouldUseCompressed(file.size, converted.size, codec) ? converted : null;
  } finally {
    input.dispose();
  }
}

/** Сжатый файл или исходник; промис отвергается только отменой (`AbortError`). */
export async function compressVideo(
  file: File,
  options: CompressVideoOptions,
): Promise<Blob> {
  const { loadLibrary = () => import('mediabunny'), ...rest } = options;
  if (!canCompressVideo()) return file;
  try {
    return (await convert(file, rest, await loadLibrary())) ?? file;
  } catch {
    if (rest.signal.aborted) throw abortError();
    return file;
  }
}
