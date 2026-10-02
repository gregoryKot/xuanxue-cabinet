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
