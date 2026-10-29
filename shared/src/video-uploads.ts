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

/** Кодек видеодорожки, как его называет Mediabunny (`track.getCodec()`) в
 * браузере (ADR-0188, ADR-0189). H.264 (`avc`) открывает любой браузер, прочие —
 * не любой: старые ролики не в H.264 перегоняет кнопка «Перегнать видео». */
export const VIDEO_CODECS = ['avc', 'hevc', 'vp9', 'av1', 'vp8'] as const;
export type VideoCodec = (typeof VIDEO_CODECS)[number];
export const H264_VIDEO_CODEC: VideoCodec = 'avc';

/** Тело `POST …/complete` (ADR-0165): кадр-превью — необязательный, видео
 * сохраняется и без него. */
export interface CompleteVideoUploadInput {
  /** JPEG кадра в base64, без префикса `data:`. */
  poster?: string;
  /** Кодек отправленного файла со слов браузера (ADR-0189): после перегона —
   * `avc`, исходник — его кодек, не прочитан — поля нет. Ошибись браузер,
   * видео просто не попадёт в «Перегнать видео» — права это не даёт. */
  codec?: VideoCodec;
}

/** Тело `PUT /exam-videos/:id/codec` (ADR-0189): кодек старого видео, прочитанный
 * браузером штата из байтов через кабинет. */
export interface SetVideoCodecInput {
  codec: VideoCodec;
}

/** Сколько видео отдаёт `GET /exam-videos/codec-pending` за раз (ADR-0189) —
 * тот же приём пачками, что у кадров (CLAUDE.md «API»: список всегда с лимитом). */
export const VIDEOS_CODEC_PENDING_BATCH = 50;

/** Тело `PUT …/:id/poster` (ADR-0182): кадр-превью для видео, загруженного до
 * того, как браузер стал снимать его при загрузке (ADR-0165). Снимает его
 * браузер штата из байтов через `GET …/:id/bytes`; первый записанный кадр не
 * перетирается. */
export interface SetVideoPosterInput {
  /** JPEG кадра в base64, без префикса `data:`. */
  poster: string;
}

/** Сколько видео без кадра отдаёт `GET …/without-poster` за раз (ADR-0182):
 * браузер снимает кадры пачкой и спрашивает следующую, пока список не опустеет
 * (CLAUDE.md «API»: список всегда с лимитом). */
export const VIDEOS_WITHOUT_POSTER_BATCH = 50;

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
