// Сырое тело запроса: распознавание формата по сигнатуре байтов и общий
// порядок проверок. Двое потребителей — картинки вариантов ответа
// (ADR-0035, байты в Mongo) и файлы материалов (ADR-0057, байты в R2);
// третьего не заводим, эта механика одна на проект (CLAUDE.md «Одна
// механика — один компонент»).
//
// Заголовку `Content-Type` не верим никогда (SECURITY §4): SVG со скриптом
// внутри с заголовком `image/svg+xml` так и остался бы исполняемым SVG, а
// произвольный файл под видом PDF уехал бы в бакет и раздавался как PDF.
//
// `.docx` — тоже не про первые байты (ADR-0080): это ZIP, а у ZIP имена
// записей лежат в центральном каталоге БЕЗ СЖАТИЯ — их можно прочитать
// напрямую, не распаковывая файлы. Значит проверка содержимого контейнера —
// это разбор настоящей структуры архива, а не «поверить заголовку» под
// другим именем.
import { InvalidInputError } from './errors';
import { readZipEntryNames } from './zip-entries';

const PDF_SIGNATURE = '%PDF-';
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = 'RIFF';
const WEBP_TAG = 'WEBP';
const WEBP_TAG_OFFSET = 8;

/** Типы, которые распознаются по сигнатуре картинки. Своё объединение, а не
 * импорт `ExamImageContentType`: общий модуль не знает про домены. */
export type ImageSignatureType = 'image/jpeg' | 'image/png' | 'image/webp';

function hasSignature(bytes: Buffer, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= WEBP_TAG_OFFSET + WEBP_TAG.length &&
    bytes.subarray(0, WEBP_RIFF.length).toString('ascii') === WEBP_RIFF &&
    bytes
      .subarray(WEBP_TAG_OFFSET, WEBP_TAG_OFFSET + WEBP_TAG.length)
      .toString('ascii') === WEBP_TAG
  );
}

export function sniffImageSignature(bytes: Buffer): ImageSignatureType | null {
  if (hasSignature(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (hasSignature(bytes, PNG_SIGNATURE)) return 'image/png';
  if (isWebp(bytes)) return 'image/webp';
  return null;
}

export function isPdfSignature(bytes: Buffer): boolean {
  return bytes.subarray(0, PDF_SIGNATURE.length).toString('ascii') === PDF_SIGNATURE;
}

/** Типы видео, распознаваемые по сигнатуре (ADR-0133). */
export type VideoSignatureType = 'video/mp4' | 'video/quicktime' | 'video/webm';

// ISO-BMFF (MP4/MOV): смещение 4–7 — код бокса `ftyp`, 8–11 — «бренд»
// контейнера. `qt  ` (с двумя пробелами) — QuickTime (.mov), остальные
// известные бренды (`isom`, `mp42`, `M4V ` и т.п.) читаем как MP4 —
// исчерпывающий список брендов MP4 не нужен: важно отличить QuickTime, не
// перечислить всех.
const FTYP_BOX = 'ftyp';
const FTYP_OFFSET = 4;
const QUICKTIME_BRAND = 'qt  ';
const BRAND_OFFSET = 8;
const BRAND_LENGTH = 4;

// WebM/Matroska — контейнер EBML, сигнатура — фиксированный ID корневого
// элемента.
const EBML_SIGNATURE = [0x1a, 0x45, 0xdf, 0xa3];

function sniffIsoBmff(bytes: Buffer): 'video/mp4' | 'video/quicktime' | null {
  if (bytes.length < BRAND_OFFSET + BRAND_LENGTH) return null;
  if (
    bytes.subarray(FTYP_OFFSET, FTYP_OFFSET + FTYP_BOX.length).toString('ascii') !==
    FTYP_BOX
  ) {
    return null;
  }
  const brand = bytes
    .subarray(BRAND_OFFSET, BRAND_OFFSET + BRAND_LENGTH)
    .toString('ascii');
  return brand === QUICKTIME_BRAND ? 'video/quicktime' : 'video/mp4';
}

export function sniffVideoSignature(bytes: Buffer): VideoSignatureType | null {
  const isoBmff = sniffIsoBmff(bytes);
  if (isoBmff) return isoBmff;
  if (hasSignature(bytes, EBML_SIGNATURE)) return 'video/webm';
  return null;
}

const DOCX_CONTENT_TYPES_ENTRY = '[Content_Types].xml';
const DOCX_DOCUMENT_ENTRY = 'word/document.xml';

/** `.docx` — ZIP-контейнер с двумя обязательными записями. Одного
 * `[Content_Types].xml` мало: он общий для всего OOXML, и `.xlsx`/`.pptx`
 * прошли бы под тем же именем (ADR-0080) — решает только присутствие
 * `word/document.xml`. Разбор каталога — в zip-entries.ts, никогда не
 * бросает: битый, обрезанный или злонамеренный буфер (например, EOCD на
 * месте, а смещение каталога уводит за пределы буфера) — просто `false`. */
export function isDocxContainer(bytes: Buffer): boolean {
  const names = readZipEntryNames(bytes);
  return names.includes(DOCX_CONTENT_TYPES_ENTRY) && names.includes(DOCX_DOCUMENT_ENTRY);
}

export interface RawUploadRules<T extends string> {
  maxBytes: number;
  sniff: (bytes: Buffer) => T | null;
  emptyMessage: string;
  tooLargeMessage: string;
  unsupportedMessage: string;
}

export interface ParsedRawUpload<T extends string> {
  bytes: Buffer;
  contentType: T;
}

/** Порядок проверок важен: пусто — раньше «слишком большое» (иначе пустое
 * тело даёт то же сообщение, что честный перебор лимита); «слишком большое» —
 * раньше «не тот формат» (тело и так режет лимит парсера в app.setup.ts, —
 * эта проверка защита в глубину). */
export function parseRawUpload<T extends string>(
  body: unknown,
  rules: RawUploadRules<T>,
): ParsedRawUpload<T> {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidInputError(rules.emptyMessage);
  }
  if (body.length > rules.maxBytes) {
    throw new InvalidInputError(rules.tooLargeMessage);
  }
  const contentType = rules.sniff(body);
  if (!contentType) {
    throw new InvalidInputError(rules.unsupportedMessage);
  }
  return { bytes: body, contentType };
}
