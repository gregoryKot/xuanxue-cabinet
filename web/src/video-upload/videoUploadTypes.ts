// Договор между общим загрузчиком видео и тем, кто его использует (ADR-0165):
// загрузчик знает порядок «старт → части → завершение», а к какому маршруту
// сервера это ведёт — решает транспорт вида видео (ответ ученика —
// attempt/answerVideoTransport.ts, видео вопроса учителя подключится так же).
// Только типы: форму ответа старта описываем здесь структурно, а не берём из
// shared/, чтобы загрузчик не зависел от DTO одного вида видео.

/** Ответ сервера на старт и на каждую принятую часть (для ответа ученика —
 * `AnswerVideoUploadDto`, он совместим по структуре). */
export interface VideoUploadSession {
  id: string;
  partBytes: number;
  partCount: number;
  /** Номера уже принятых частей — по ним браузер продолжает с первой
   * недостающей (ADR-0137). */
  receivedParts: number[];
}

/** Что загрузчик передаёт в каждый сетевой вызов транспорта: отмену и,
 * для частей, свой таймаут (videoUploadRunner.ts). */
interface VideoUploadRequest {
  signal: AbortSignal;
  timeoutMs?: number;
}

export interface VideoUploadTransport<TResult extends object> {
  /** Заводит загрузку или находит незаконченную того же файла (по отпечатку). */
  start: (
    input: { sizeBytes: number; fingerprint: string },
    request: VideoUploadRequest,
  ) => Promise<VideoUploadSession>;
  uploadPart: (
    uploadId: string,
    partNumber: number,
    body: Blob,
    request: VideoUploadRequest,
  ) => Promise<VideoUploadSession>;
  /** Завершает загрузку; `TResult` — то, что вид видео кладёт на экран.
   * Объект, не пустое значение: `undefined` у прогона значит «шаг не удался».
   * `poster` — JPEG кадра в base64, если браузер успел его снять (ADR-0165);
   * без него видео сохраняется так же. */
  complete: (
    uploadId: string,
    poster: string | undefined,
    request: VideoUploadRequest,
  ) => Promise<TResult>;
}

/** Сколько частей принято из скольких — по числу частей, не байт: сырой
 * `PUT` без XHR не даёт промежуточного прогресса внутри части. */
export interface VideoUploadProgressUpdate {
  sentParts: number;
  partCount: number;
  partBytes: number;
}
