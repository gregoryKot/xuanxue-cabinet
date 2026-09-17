// Распознавание формата картинки варианта по сигнатуре байтов, не по
// заголовку Content-Type (ADR-0035, SECURITY §4): честному заголовку не
// верим — SVG со скриптом внутри с заголовком image/svg+xml так и остался
// бы исполняемым SVG, если бы сервер доверял тому, что прислал клиент.
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  type ExamImageContentType,
} from '@xuanxue/shared';
import { InvalidInputError } from '../common/errors';

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP_RIFF = 'RIFF';
const WEBP_TAG = 'WEBP';
const WEBP_TAG_OFFSET = 8;

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

/** Формат по первым байтам файла — единственный источник правды (см.
 * комментарий в начале файла). `null`, если сигнатура не одна из трёх
 * поддерживаемых. */
export function sniffExamImageType(bytes: Buffer): ExamImageContentType | null {
  if (hasSignature(bytes, JPEG_SIGNATURE)) return 'image/jpeg';
  if (hasSignature(bytes, PNG_SIGNATURE)) return 'image/png';
  if (isWebp(bytes)) return 'image/webp';
  return null;
}

export interface ParsedExamImage {
  bytes: Buffer;
  contentType: ExamImageContentType;
}

/** Порядок проверок важен: пусто — раньше «слишком большое» (иначе пустое
 * тело даёт то же сообщение, что честный перебор лимита); «слишком
 * большое» — раньше «не тот формат» (тело и так режет лимит парсера,
 * exam-image-body.ts/app.setup.ts, — эта проверка защита в глубину). */
export function parseExamImageUpload(body: unknown): ParsedExamImage {
  if (!Buffer.isBuffer(body) || body.length === 0) {
    throw new InvalidInputError(EXAM_IMAGE_EMPTY_MESSAGE);
  }
  if (body.length > EXAM_IMAGE_LIMITS.maxBytes) {
    throw new InvalidInputError(EXAM_IMAGE_TOO_LARGE_MESSAGE);
  }
  const contentType = sniffExamImageType(body);
  if (!contentType) {
    throw new InvalidInputError(EXAM_IMAGE_UNSUPPORTED_MESSAGE);
  }
  return { bytes: body, contentType };
}
