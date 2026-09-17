// Картинки вариантов ответа (ADR-0035, docs/PLAN.md §11 слой 4.2): вариантом
// в тесте может быть не текст, а фотография стойки или формы. Байты лежат в
// MongoDB и раздаются нашим API (`GET /api/exam-images/:id`), загрузка —
// сырым телом `POST /api/exam-images` с `Content-Type` одного из типов ниже;
// формат сервер определяет по сигнатуре байтов, заголовку не верит.
//
// DTO несёт только описание файла — сами байты в JSON не ходят никогда:
// картинка приходит отдельным запросом по своему адресу, который браузер
// кеширует (адрес неизменяемый: картинка не редактируется, только
// заменяется новой).

export const EXAM_IMAGE_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type ExamImageContentType = (typeof EXAM_IMAGE_CONTENT_TYPES)[number];

export interface ExamImageDto {
  id: string;
  contentType: ExamImageContentType;
  sizeBytes: number;
  createdAt: string; // ISO UTC с Z
}

const BYTES_IN_MB = 1024 * 1024;

export const EXAM_IMAGE_LIMITS = {
  /** Потолок одного файла на сервере. Рабочий размер много меньше:
   * браузер ужимает фото до 1280 px по длинной стороне перед отправкой
   * (150–300 КБ), потолок — страховка от сырого фото с телефона (5–8 МБ)
   * и от роста базы Atlas M0 (512 МБ на всё, ADR-0035). */
  maxBytes: BYTES_IN_MB,
} as const;

// VOICE: что случилось и что сделать дальше.
export const EXAM_IMAGE_EMPTY_MESSAGE =
  'Файл не пришёл. Выберите картинку и загрузите её ещё раз.';
export const EXAM_IMAGE_UNSUPPORTED_MESSAGE =
  'Такой формат не подходит. Загрузите картинку в JPG, PNG или WebP.';
export const EXAM_IMAGE_TOO_LARGE_MESSAGE = `Картинка больше ${EXAM_IMAGE_LIMITS.maxBytes / BYTES_IN_MB} МБ. Уменьшите её и загрузите ещё раз.`;
// Один текст и для несуществующего id, и для картинки не из своей попытки
// (SECURITY §3: не подтверждаем существование того, что человеку не положено).
export const EXAM_IMAGE_NOT_FOUND_MESSAGE = 'Картинка не найдена. Загрузите её ещё раз.';

/** Число картинок вариантов ответа и их суммарный объём — число раздела
 * «Экзамены» (CLAUDE.md «Продуктовая фича = число в своём разделе»): база
 * растёт с каждой картинкой (~200 КБ, ADR-0035 «Последствия»), и админ
 * должен видеть объём, а не заглядывать в метрики Atlas. */
export interface ExamImageStatsDto {
  count: number;
  totalBytes: number;
}
