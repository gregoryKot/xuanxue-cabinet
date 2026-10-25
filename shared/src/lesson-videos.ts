// Запись занятия файлом (ADR-0180, PLAN §18 слой 1): учитель выбирает готовый
// смонтированный файл, он уходит в Cloudflare R2 тем же загрузчиком частями с
// докачкой, что видео вопроса и видео-ответ (ADR-0165, shared/src/video-uploads.ts),
// и привязывается к записи занятия (`Recording.videoId`). Сам файл отдаётся
// адресом `GET /api/lesson-videos/:id` редиректом на подписанную ссылку R2, как
// видео вопроса, — байты идут мимо нашего инстанса (ADR-0057).

import type { ExamVideoContentType } from './exam-videos';

const BYTES_IN_MB = 1024 * 1024;

export const LESSON_VIDEO_LIMITS = {
  /** 2000 МБ, а не «2 ГБ»: это предел файла у своего `telegram-bot-api --local`,
   * куда запись потом уйдёт ботом (ADR-0180). Файл больше бот не примет, так что и
   * грузить его в кабинет незачем. Сжатия в браузере нет: файл уже смонтирован.
   * Частей по 8 МиБ выходит 250 — в пределах четырёх цифр номера в маршруте части и
   * 10 000 частей R2. */
  maxBytes: 2000 * BYTES_IN_MB,
} as const;

/** Старт загрузки записи занятия: тот же протокол, что у видео вопроса, — без
 * занятия и без вопроса. Видео принадлежит школе и привязывается к записи отдельным
 * шагом (`POST /lessons/:id/recording` с `videoId`). */
export interface StartLessonVideoInput {
  /** Заявленный размер всего файла — по нему считается число частей. */
  sizeBytes: number;
  fingerprint: string;
}

export interface LessonVideoDto {
  id: string;
  contentType: ExamVideoContentType;
  sizeBytes: number;
  createdAt: string; // ISO UTC с Z
}

// VOICE: что случилось и что сделать дальше.
export const LESSON_VIDEO_TOO_LARGE_MESSAGE =
  `Файл больше ${LESSON_VIDEO_LIMITS.maxBytes / BYTES_IN_MB} МБ. ` +
  'Сожмите запись или дайте ссылкой.';
// Видео есть, но ещё грузится частями: к записи занятия его привязать нельзя, а
// «не найдено» ввело бы учителя в заблуждение.
export const LESSON_VIDEO_UPLOADING_MESSAGE =
  'Файл ещё загружается. Дождитесь конца загрузки и добавьте запись снова.';
// Один текст на несуществующий id и на видео, которое не привязано ни к одной
// записи (SECURITY §3: не подтверждаем существование того, что человеку не положено).
export const LESSON_VIDEO_NOT_FOUND_MESSAGE = 'Видео не найдено. Загрузите файл ещё раз.';
