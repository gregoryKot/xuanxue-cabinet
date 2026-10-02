// Видео вопроса и видео варианта ответа (ADR-0133, слой 4.2 вслед за
// картинками, shared/src/exam-images.ts): учитель показывает короткий
// ролик — «что не так в этом движении», «какой из двух выполнен верно».
// Байты лежат в Cloudflare R2 (ADR-0057 завёл его для материалов), когда R2
// подключён (`FileStoreService.isEnabled`, `fileStorageEnabled` в
// `GET /auth/config`); без R2 — видео по https-ссылке (YouTube и т.п.).
// Модель данных экзамена (`exam_items.videoId`/`videoUrl`,
// `ExamItemOptionDto.videoId`/`videoUrl`) поддерживает оба варианта разом —
// какой доступен, решает `fileStorageEnabled` на экране, не тип поля.
//
// DTO несёт только описание файла — сами байты в JSON не ходят: видео
// отдаётся отдельным адресом (`GET /api/exam-videos/:id`), который отвечает
// редиректом на подписанную ссылку R2, не байтами напрямую (ADR-0133).

export const EXAM_VIDEO_CONTENT_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
export type ExamVideoContentType = (typeof EXAM_VIDEO_CONTENT_TYPES)[number];

/** Параметр `?download=1` у адреса видео (`/api/exam-videos/:id`,
 * `/api/answer-videos/:id`): редирект ведёт на подписанную ссылку с
 * `Content-Disposition: attachment`, браузер сохраняет файл, а не играет его
 * (ADR-0165, «Плеер»). Одна пара констант на api и web, чтобы валидатор
 * и ссылка «Скачать» не разошлись. */
export const VIDEO_DOWNLOAD_QUERY_PARAM = 'download';
export const VIDEO_DOWNLOAD_QUERY_VALUE = '1';

/** Query GET /exam-videos/:id и GET /answer-videos/:id. */
export interface VideoDownloadQuery {
  [VIDEO_DOWNLOAD_QUERY_PARAM]?: typeof VIDEO_DOWNLOAD_QUERY_VALUE;
}

/** Старт загрузки видео вопроса частями (ADR-0165): тот же протокол, что у
 * видео-ответа, без вопроса и попытки — видео принадлежит школе. */
export interface StartExamVideoInput {
  /** Заявленный размер всего файла — по нему считается число частей. */
  sizeBytes: number;
  fingerprint: string;
}

export interface ExamVideoDto {
  id: string;
  contentType: ExamVideoContentType;
  sizeBytes: number;
  createdAt: string; // ISO UTC с Z
}

const BYTES_IN_MB = 1024 * 1024;

export const EXAM_VIDEO_LIMITS = {
  /** Потолок одного файла — короткий ролик одного движения, не запись
   * занятия целиком. Это и предел бота: он шлёт файл в Telegram целиком, а
   * загрузка ботом ограничена 50 МБ (ADR-0165). Файл идёт на сервер частями
   * по 8 МиБ, так что в памяти инстанса лежит часть, а не 50 МБ разом. */
  maxBytes: 50 * BYTES_IN_MB,
  /** Длина https-ссылки (YouTube и т.п.) — без R2 видео живёт только так. */
  videoUrl: 500,
} as const;

// VOICE: что случилось и что сделать дальше.
export const EXAM_VIDEO_EMPTY_MESSAGE =
  'Файл не пришёл. Выберите видео и загрузите его ещё раз.';
export const EXAM_VIDEO_UNSUPPORTED_MESSAGE =
  'Такой формат не подходит. Загрузите видео в MP4, MOV или WebM.';
export const EXAM_VIDEO_TOO_LARGE_MESSAGE =
  `Видео больше ${EXAM_VIDEO_LIMITS.maxBytes / BYTES_IN_MB} МБ. ` +
  'Сократите запись или дайте ссылкой на YouTube.';
// Видео есть, но ещё грузится частями (ADR-0165): вопрос с таким id сохранить
// нельзя, а «не найдено» ввело бы учителя в заблуждение.
export const EXAM_VIDEO_UPLOADING_MESSAGE =
  'Видео ещё загружается. Дождитесь конца загрузки и сохраните вопрос снова.';
// Один текст и для несуществующего id, и для видео не из своей попытки
// (SECURITY §3: не подтверждаем существование того, что человеку не положено).
export const EXAM_VIDEO_NOT_FOUND_MESSAGE = 'Видео не найдено. Загрузите его ещё раз.';

/** Число видео и их суммарный объём — число раздела «Экзамены» (CLAUDE.md
 * «Продуктовая фича = число в своём разделе»), тем же приёмом, что
 * ExamImageStatsDto: 50 МБ на ролик растят базу быстрее картинок, админ
 * должен видеть объём. */
export interface ExamVideoStatsDto {
  count: number;
  totalBytes: number;
}
