// Источник байтов для Mediabunny: файл в памяти или адрес со своего домена
// (ADR-0182: старые видео читаются по `Range` из кабинета). Общий для снимка
// кадра (posterFromLibrary.ts) и чтения кодека (probeVideoCodec.ts, ADR-0189).
import type { MediabunnyLibrary } from './compressVideo';

// Кадр и кодек лежат в индексе и первых кусках: кэшировать весь файл (по
// умолчанию 64 МиБ) незачем (ADR-0182).
const URL_SOURCE_CACHE_BYTES = 16 * 1024 * 1024;
// Библиотека по умолчанию повторяет упавший запрос без конца; а у нас чтение
// ограничено по времени, и брошенный по сроку повтор крутился бы в фоне вечно.
const URL_SOURCE_MAX_RETRIES = 2;
const URL_SOURCE_RETRY_DELAY_SEC = 1;

export function openVideoSource(source: Blob | string, lib: MediabunnyLibrary) {
  if (typeof source !== 'string') return new lib.BlobSource(source);
  return new lib.UrlSource(source, {
    maxCacheSize: URL_SOURCE_CACHE_BYTES,
    getRetryDelay: (previousAttempts) =>
      previousAttempts < URL_SOURCE_MAX_RETRIES ? URL_SOURCE_RETRY_DELAY_SEC : null,
  });
}
