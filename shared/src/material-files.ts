// Файл материала в Cloudflare R2 (ADR-0057, docs/PLAN.md §14 слой 3.10).
// Загрузка — `POST /api/materials/:id/file` сырым телом, штату школы;
// скачивание — `GET /api/materials/:id/file`, ответ `302` на подписанную
// ссылку со сроком жизни в минуты: байты идут мимо нашего инстанса.
//
// В JSON файл ходит описанием, сами байты — никогда: у материала есть либо
// ссылка (`url`), либо файл, либо и то и другое.

/** Длинный OOXML-тип Word повторяется в проверке загрузки и в трёх наборах
 * тестов — имя ему даётся здесь, рядом со списком (CLAUDE.md «Без магических
 * строк»). */
export const MATERIAL_FILE_DOCX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Что принимаем. Формат определяется по сигнатуре байтов, а не по заголовку
 * `Content-Type` (SECURITY §4, тот же приём, что у картинок вариантов,
 * ADR-0035): отдаём мы ровно то, что приняли, и подписывать чужой заголовок
 * своим адресом не станем.
 *
 * Методичка, распечатка, схема, фотография страницы — всё, что учитель
 * кладёт со своего компьютера. Видео здесь нет: экзаменационное живёт в
 * Telegram (ADR-0023), учебное — ссылкой на хостинг.
 *
 * `.docx` проверяется глубже остальных (ADR-0082). Первые четыре байта у
 * него `PK\x03\x04`, как у любого ZIP, и на них останавливаться нельзя.
 * Но у ZIP есть центральный каталог, а имена записей лежат в нём без
 * сжатия: `isDocxContainer` (api/src/common/raw-upload.ts) читает их и
 * требует и `[Content_Types].xml`, и `word/document.xml`. Заголовку мы
 * по-прежнему не верим — решают байты. `.xlsx`, `.pptx` и просто `.zip`
 * второй записи не содержат и отсюда уходят с отказом.
 */
export const MATERIAL_FILE_CONTENT_TYPES = [
  'application/pdf',
  MATERIAL_FILE_DOCX_CONTENT_TYPE,
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type MaterialFileContentType = (typeof MATERIAL_FILE_CONTENT_TYPES)[number];

const BYTES_IN_MB = 1024 * 1024;

export const MATERIAL_FILE_LIMITS = {
  /** Потолок одного файла. Книга на 30 МБ — тот самый случай, ради которого
   * ADR-0057 вернул R2 (в MongoDB такому не место: у Atlas M0 512 МБ на всю
   * базу). Выше не поднимаем: тело целиком держится в памяти инстанса
   * Railway, пока идёт загрузка. */
  maxBytes: 30 * BYTES_IN_MB,
  /** Длина исходного имени файла — с ним браузер сохраняет скачанное. */
  name: 200,
} as const;

/** Описание файла материала. Ключ объекта в R2 наружу не отдаётся: по нему
 * файл и скачивается, а право на скачивание проверяем мы (ADR-0057). */
export interface MaterialFileDto {
  name: string;
  contentType: MaterialFileContentType;
  sizeBytes: number;
  uploadedAt: string; // ISO UTC с Z
}

// VOICE.md: что случилось и что делать дальше.
export const MATERIAL_FILE_EMPTY_MESSAGE =
  'Файл не пришёл. Выберите его и загрузите ещё раз.';
export const MATERIAL_FILE_UNSUPPORTED_MESSAGE =
  'Такой формат не подходит. Загрузите PDF, документ Word (.docx) или картинку — JPG, PNG, WebP.';
export const MATERIAL_FILE_TOO_LARGE_MESSAGE = `Файл больше ${MATERIAL_FILE_LIMITS.maxBytes / BYTES_IN_MB} МБ. Сожмите его или дайте ссылкой.`;
/** Один текст и для материала без файла, и для закрытого по оплате: ученику
 * не подтверждаем, что файл вообще есть (SECURITY §3, ADR-0048). */
export const MATERIAL_FILE_NOT_FOUND_MESSAGE =
  'Файла нет. Откройте список материалов заново.';
