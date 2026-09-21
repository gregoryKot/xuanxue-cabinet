// Сырое тело запроса: распознавание формата по сигнатуре байтов и общий
// порядок проверок. Двое потребителей — картинки вариантов ответа
// (ADR-0035, байты в Mongo) и файлы материалов (ADR-0057, байты в R2);
// третьего не заводим, эта механика одна на проект (CLAUDE.md «Одна
// механика — один компонент»).
//
// Заголовку `Content-Type` не верим никогда (SECURITY §4): SVG со скриптом
// внутри с заголовком `image/svg+xml` так и остался бы исполняемым SVG, а
// произвольный файл под видом PDF уехал бы в бакет и раздавался как PDF.
import { InvalidInputError } from './errors';

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
