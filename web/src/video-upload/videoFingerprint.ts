// Отпечаток файла для продолжения загрузки видео частями (ADR-0137, ADR-0165,
// находка F18 аудита 2026-10-01): по нему сервер решает, продолжать ли
// незаконченную загрузку или начать новую. Один на все виды видео-файлов. Отпечаток обязан узнавать именно
// БАЙТЫ, которые уходят, а не файл «по виду»: после сжатия в браузере (ADR-0165)
// повторный прогон может дать другой результат, и части от одного прогона,
// принятые за части другого, склеились бы в битое видео.

const BYTES_PER_MIB = 1024 * 1024;

/** Сколько байт берём с головы и столько же с хвоста. Весь файл до гигабайта
 * на телефоне читать долго и тяжело по памяти; а у mp4 таблица кадров (moov)
 * лежит в начале (faststart) или в конце, и перекодирование меняет её, а с ней
 * и край файла. Правка строго в середине при том же размере отпечаток не
 * заметит — на настоящих видео такого не бывает, и мы сознательно платим этим
 * за 2 МиБ чтения вместо гигабайта. */
const FINGERPRINT_WINDOW_BYTES = BYTES_PER_MIB;

const SHA256_ALGORITHM = 'SHA-256';
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('');
}

/** Что хэшируем: файл целиком, пока голова и хвост покрывают его без дыр, иначе
 * только голова и хвост. */
function fingerprintSample(blob: Blob): Blob {
  if (blob.size <= FINGERPRINT_WINDOW_BYTES * 2) return blob;
  return new Blob([
    blob.slice(0, FINGERPRINT_WINDOW_BYTES),
    blob.slice(blob.size - FINGERPRINT_WINDOW_BYTES),
  ]);
}

/** Запасной отпечаток там, где нет `crypto.subtle` (страница не по https — на
 * проде так не бывает, но падать из-за этого незачем): размер и дата изменения,
 * как было до F18. У `Blob` без даты (сжатый результат) узнавать нечем, и
 * продолжать чужие части нельзя, поэтому отпечаток у него каждый раз новый —
 * загрузка начнётся заново, битого видео не будет. */
function fallbackFingerprint(blob: Blob): string {
  const stamp =
    blob instanceof File
      ? String(blob.lastModified)
      : `new-${Math.random().toString(36)}`;
  return `${blob.size}:${stamp}`;
}

/** `размер:SHA-256` первых и последних 1 МиБ (весь файл, если он не больше
 * 2 МиБ). Длина — до 10 цифр размера (потолок 1 ГБ), двоеточие и 64 знака
 * хэша: в предел сервера (`ANSWER_VIDEO_LIMITS.fingerprint`, 100) помещается
 * с запасом. Не зависит от имени и даты изменения: тот же ролик, снова
 * выбранный из «Фото» на iPhone (там дата каждый раз новая), продолжает ту же
 * загрузку. Отвергает промис, если файл не читается (iOS убрал временную
 * копию, нет прав). */
export async function computeVideoFingerprint(blob: Blob): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return fallbackFingerprint(blob);
  const bytes = await fingerprintSample(blob).arrayBuffer();
  const digest = await crypto.subtle.digest(SHA256_ALGORITHM, bytes);
  return `${blob.size}:${toHex(digest)}`;
}
