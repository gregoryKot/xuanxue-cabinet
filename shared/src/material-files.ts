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
/** Тип EPUB, зарегистрированный в IANA. EPUB — тоже ZIP-контейнер (ADR-0080,
 * дополнение 2026-09-27), поэтому имя рядом с `.docx`, по той же причине. */
export const MATERIAL_FILE_EPUB_CONTENT_TYPE = 'application/epub+zip';
/** Тип RTF, зарегистрированный в IANA. */
export const MATERIAL_FILE_RTF_CONTENT_TYPE = 'application/rtf';
/** Второй тип для того же RTF: браузер ставит `Content-Type` из `file.type`,
 * а его источник — не только IANA. На macOS система знает RTF через UTI
 * `public.rtf` с MIME `text/rtf` и отдаёт браузеру именно его; Windows и
 * Linux в наших проверках отдавали `application/rtf` (Chromium держит его в
 * таблице типов для случая, когда платформа своего не знает). Оба заголовка
 * включают загрузку (`MATERIAL_FILE_UPLOAD_CONTENT_TYPES` ниже), но формат
 * решает сигнатура байтов `{\rtf1` (`isRtfSignature`), и результат всегда
 * один — `MATERIAL_FILE_RTF_CONTENT_TYPE`: иначе один и тот же формат лёг бы
 * в базу под двумя разными значениями. */
export const MATERIAL_FILE_RTF_ALT_CONTENT_TYPE = 'text/rtf';

/**
 * Что принимаем. Формат определяется по сигнатуре байтов, а не по заголовку
 * `Content-Type` (SECURITY §4, тот же приём, что у картинок вариантов,
 * ADR-0035): отдаём мы ровно то, что приняли, и подписывать чужой заголовок
 * своим адресом не станем.
 *
 * Методичка, распечатка, схема, фотография страницы, книга — всё, что
 * учитель кладёт со своего компьютера. Видео здесь нет: экзаменационное
 * живёт в Telegram (ADR-0023), учебное — ссылкой на хостинг.
 *
 * Два формата проверяются глубже сигнатуры первых байт (ADR-0080). `.docx` и
 * `.epub` — оба ZIP-контейнеры, и первые четыре байта у обоих `PK\x03\x04`,
 * как у любого архива, — на них останавливаться нельзя. Но у ZIP есть
 * центральный каталог, а имена записей лежат в нём без сжатия:
 * `readZipEntryNames` (api/src/common/zip-entries.ts) читает их без
 * распаковки, и дальше решает присутствие нужных имён — `isDocxContainer`
 * требует `[Content_Types].xml` и `word/document.xml`, `isEpubContainer`
 * требует `META-INF/container.xml` и `mimetype` (оба имени зарезервированы
 * спецификацией EPUB). Заголовку мы по-прежнему не верим — решают байты.
 * `.xlsx`, `.pptx` и просто `.zip` не содержат нужных записей и отсюда
 * уходят с отказом.
 */
export const MATERIAL_FILE_CONTENT_TYPES = [
  'application/pdf',
  MATERIAL_FILE_DOCX_CONTENT_TYPE,
  MATERIAL_FILE_EPUB_CONTENT_TYPE,
  MATERIAL_FILE_RTF_CONTENT_TYPE,
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export type MaterialFileContentType = (typeof MATERIAL_FILE_CONTENT_TYPES)[number];

/** Заголовки запроса, которые включают загрузку — шире `MATERIAL_FILE_CONTENT_TYPES`
 * на один альтернативный тип RTF (см. комментарий у `MATERIAL_FILE_RTF_ALT_CONTENT_TYPE`).
 * Используется предикатом сырого тела (`material-file-body.ts`) и проверкой в
 * браузере (`checkMaterialFile`) — оба места решают, включать ли разбор,
 * а не то, что в итоге попадёт в `MaterialFileDto.contentType`. */
export const MATERIAL_FILE_UPLOAD_CONTENT_TYPES = [
  ...MATERIAL_FILE_CONTENT_TYPES,
  MATERIAL_FILE_RTF_ALT_CONTENT_TYPE,
] as const;

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
  'Такой формат не подходит. Загрузите PDF, документ Word (.docx), EPUB или RTF — ' +
  'либо картинку JPG, PNG, WebP.';
export const MATERIAL_FILE_TOO_LARGE_MESSAGE = `Файл больше ${MATERIAL_FILE_LIMITS.maxBytes / BYTES_IN_MB} МБ. Сожмите его или дайте ссылкой.`;
/** Один текст и для материала без файла, и для закрытого по оплате: ученику
 * не подтверждаем, что файл вообще есть (SECURITY §3, ADR-0048). */
export const MATERIAL_FILE_NOT_FOUND_MESSAGE =
  'Файла нет. Откройте список материалов заново.';
