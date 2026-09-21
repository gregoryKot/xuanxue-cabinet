// Распознавание формата картинки варианта по сигнатуре байтов, не по
// заголовку Content-Type (ADR-0035, SECURITY §4). Сигнатуры и общий порядок
// проверок переехали в common/raw-upload.ts, когда та же механика
// понадобилась файлам материалов (ADR-0057): два распознавателя сигнатур в
// разных файлах — это две правды о том, что такое PNG.
import {
  EXAM_IMAGE_EMPTY_MESSAGE,
  EXAM_IMAGE_LIMITS,
  EXAM_IMAGE_TOO_LARGE_MESSAGE,
  EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  type ExamImageContentType,
} from '@xuanxue/shared';
import { parseRawUpload, sniffImageSignature } from '../common/raw-upload';

export interface ParsedExamImage {
  bytes: Buffer;
  contentType: ExamImageContentType;
}

export function parseExamImageUpload(body: unknown): ParsedExamImage {
  return parseRawUpload<ExamImageContentType>(body, {
    maxBytes: EXAM_IMAGE_LIMITS.maxBytes,
    sniff: sniffImageSignature,
    emptyMessage: EXAM_IMAGE_EMPTY_MESSAGE,
    tooLargeMessage: EXAM_IMAGE_TOO_LARGE_MESSAGE,
    unsupportedMessage: EXAM_IMAGE_UNSUPPORTED_MESSAGE,
  });
}
