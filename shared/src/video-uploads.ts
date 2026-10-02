// Загрузка видео-файлов частями (ADR-0137, ADR-0165) — тип, общий для всех
// видов видео: и видео-ответа ученика (answer-videos.ts), и видео вопроса
// (exam-videos.ts). Сам протокол один: старт → части → complete.

export interface VideoUploadDto {
  id: string;
  partBytes: number;
  partCount: number;
  /** Номера частей, которые уже приняты — по ним браузер продолжает с
   * первой недостающей, не начинает заново (ADR-0137). */
  receivedParts: number[];
}

/** Тело `POST …/complete` (ADR-0165): кадр-превью — необязательный, видео
 * сохраняется и без него. */
export interface CompleteVideoUploadInput {
  /** JPEG кадра в base64, без префикса `data:`. */
  poster?: string;
}

const BYTES_IN_KB = 1024;
const BYTES_PER_BASE64_GROUP = 3;
const CHARS_PER_BASE64_GROUP = 4;

export const VIDEO_POSTER_LIMITS = {
  /** Кадр в 480 px по длинной стороне — JPEG на 20–60 КБ. Потолок втрое выше
   * нужного и ровно для того, чтобы кривой клиент не раздул документ Mongo
   * (кадр лежит в той же записи, что и видео, ADR-0165). */
  maxBytes: 150 * BYTES_IN_KB,
  /** Длина того же кадра в base64: по четыре знака на каждые три байта. Для
   * проверки тела до того, как оно разложено в память. */
  maxBase64Length:
    Math.ceil((150 * BYTES_IN_KB) / BYTES_PER_BASE64_GROUP) * CHARS_PER_BASE64_GROUP,
} as const;

// VOICE: что случилось и что сделать дальше. Кадр — украшение, не условие:
// видео сохранится и без него.
export const VIDEO_POSTER_NOT_JPEG_MESSAGE =
  'Кадр-превью не подошёл: нужен JPEG. Видео сохранится и без него.';
export const VIDEO_POSTER_TOO_LARGE_MESSAGE =
  `Кадр-превью больше ${VIDEO_POSTER_LIMITS.maxBytes / BYTES_IN_KB} КБ. ` +
  'Видео сохранится и без него.';
// Старое видео кадра не имеет, а у нового он необязателен: не ошибка клиента, а
// «нечего показать» — плеер рисует видео как раньше.
export const VIDEO_POSTER_NOT_FOUND_MESSAGE = 'У этого видео нет кадра-превью.';
