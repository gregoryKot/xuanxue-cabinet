// Что за видео и сумеет ли этот браузер его перегнать (ADR-0189): по адресу со
// своего домена, кусками через `Range` — индекс и заголовок дорожки, а не весь
// файл (файл в памяти тоже годится). Нужно кнопке «Перегнать видео»: H.264 помечается без скачивания, а
// HEVC, который этот браузер не декодирует, не качается впустую. Не бросает:
// что бы ни пошло не так, итог «прочитать не вышло».
import type { VideoCodec } from '@xuanxue/shared';
import { combineAbortSignals } from '../api/abortSignals';
import { canCompressVideo, type MediabunnyLibrary } from './compressVideo';
import { openVideoSource } from './openVideoSource';
import { untilAborted } from './untilAborted';
import { toVideoCodec } from './videoCodec';

export interface VideoProbe {
  /** Кодек первой дорожки; `null` — не прочитан или его нет в VIDEO_CODECS. */
  codec: VideoCodec | null;
  /** Можно ли перегнать здесь: в браузере есть кодировщик и декодер для
   * дорожки. Не прочитанное видео перегнать нельзя. */
  canConvert: boolean;
}

export interface ProbeVideoCodecOptions {
  signal: AbortSignal;
  /** Потолок на всё чтение: сеть, которая молчит, не должна держать прогон. */
  timeoutMs: number;
  /** Подмена в тестах; по умолчанию — ленивый кусок с библиотекой. */
  loadLibrary?: () => Promise<MediabunnyLibrary>;
}

const UNREADABLE: VideoProbe = { codec: null, canConvert: false };

async function readProbe(
  source: Blob | string,
  lib: MediabunnyLibrary,
): Promise<VideoProbe> {
  const input = new lib.Input({
    source: openVideoSource(source, lib),
    formats: lib.ALL_FORMATS,
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return UNREADABLE;
    return {
      codec: toVideoCodec(await track.getCodec()) ?? null,
      canConvert: canCompressVideo() && (await track.canDecode()),
    };
  } finally {
    input.dispose();
  }
}

export async function probeVideoCodec(
  source: Blob | string,
  options: ProbeVideoCodecOptions,
): Promise<VideoProbe> {
  const { signal: outer, timeoutMs, loadLibrary = () => import('mediabunny') } = options;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const signal = combineAbortSignals([outer, deadline.signal]);
  try {
    return await untilAborted(
      loadLibrary().then((lib) => readProbe(source, lib)),
      signal,
    );
  } catch {
    return UNREADABLE;
  } finally {
    clearTimeout(timer);
  }
}
