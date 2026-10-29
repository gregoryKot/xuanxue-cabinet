// Сжатие видео в браузере перед загрузкой (ADR-0165): MP4 с H.264, кадр до
// 1280×720, около 2 Мбит/с, индекс в начале файла. Видео не в H.264 (HEVC с
// iPhone и т. п.) перегоняется всегда, каким бы маленьким оно ни было, —
// иначе у части зрителей оно не откроется (ADR-0188). Библиотека Mediabunny
// (WebCodecs + разбор и сборка MP4) грузится отдельным куском только здесь —
// на стартовую страницу она не попадает. Перегон — оптимизация и забота о
// совместимости, а не условие: что бы ни пошло не так, уходит исходный файл.
import { H264_VIDEO_CODEC, type VideoCodec } from '@xuanxue/shared';
import type * as Mediabunny from 'mediabunny';
import { toVideoCodec } from './videoCodec';
import { probeTarget } from './probeVideoTarget';
import {
  canSkipConversion,
  shouldConvertSource,
  shouldUseCompressed,
} from './videoCompressionPlan';

export type MediabunnyLibrary = typeof Mediabunny;

const OUTPUT_MIME_TYPE = 'video/mp4';

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

/** Что получилось: файл и кодек, который о нём сообщаем серверу (ADR-0189). */
export interface CompressedVideo {
  /** Перегнанный файл или исходник. */
  file: Blob;
  /** Кодек `file`: `avc` после перегона, у исходника — прочитанный библиотекой;
   * `undefined`, если библиотека не грузилась, дорожки нет или кодека нет в
   * VIDEO_CODECS. */
  codec: VideoCodec | undefined;
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

/** Результат перегона, который стоит взять вместо исходника, или `null` —
 * отдавать исходник: сжимать нечем или незачем, либо результат хуже. */
async function convert(
  file: Blob,
  options: Omit<CompressVideoOptions, 'loadLibrary'> & {
    /** Кодек исходника сразу, как прочитан: нужен и когда перегон не вышел. */
    onSourceCodec: (codec: VideoCodec | undefined) => void;
  },
  lib: MediabunnyLibrary,
): Promise<Blob | null> {
  const { signal, onProgress, onConversionStart, onSourceCodec } = options;
  signal.throwIfAborted();
  const input = new lib.Input({
    source: new lib.BlobSource(file),
    formats: lib.ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const codec = await track.getCodec();
    onSourceCodec(toVideoCodec(codec));
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
        codec: H264_VIDEO_CODEC,
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

/** Сжатый файл или исходник и его кодек; промис отвергается только отменой
 * (`AbortError`). Принимает и `File` выбора, и `Blob` байтов старого видео
 * (кнопка «Перегнать видео», ADR-0189). */
export async function compressVideo(
  file: Blob,
  options: CompressVideoOptions,
): Promise<CompressedVideo> {
  const { loadLibrary = () => import('mediabunny'), ...rest } = options;
  if (!canCompressVideo()) return { file, codec: undefined };
  // Объект, а не `let`: TS не видит присваивания в колбэке и сузил бы переменную
  // до `undefined` в обоих выходах ниже.
  const source: { codec?: VideoCodec } = {};
  try {
    const converted = await convert(
      file,
      { ...rest, onSourceCodec: (codec) => (source.codec = codec) },
      await loadLibrary(),
    );
    if (converted) return { file: converted, codec: H264_VIDEO_CODEC };
  } catch {
    if (rest.signal.aborted) throw abortError();
  }
  return { file, codec: source.codec };
}
