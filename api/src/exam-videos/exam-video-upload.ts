// Разбор сырого тела загрузки видео (ADR-0133). Формат определяется по
// сигнатуре байтов, не по заголовку Content-Type (SECURITY §4, общий
// механизм — common/raw-upload.ts): честному заголовку не верим — с ним в R2
// уехал бы любой файл под видом MP4.
//
// Чистая функция без Mongo и без DI (CLAUDE.md «Логика вне контроллеров»).
import {
  EXAM_VIDEO_EMPTY_MESSAGE,
  EXAM_VIDEO_LIMITS,
  EXAM_VIDEO_TOO_LARGE_MESSAGE,
  EXAM_VIDEO_UNSUPPORTED_MESSAGE,
  type ExamVideoContentType,
} from '@xuanxue/shared';
import { parseRawUpload, sniffVideoSignature } from '../common/raw-upload';

export interface ParsedExamVideo {
  bytes: Buffer;
  contentType: ExamVideoContentType;
}

export function parseExamVideoUpload(body: unknown): ParsedExamVideo {
  return parseRawUpload<ExamVideoContentType>(body, {
    maxBytes: EXAM_VIDEO_LIMITS.maxBytes,
    sniff: sniffVideoSignature,
    emptyMessage: EXAM_VIDEO_EMPTY_MESSAGE,
    tooLargeMessage: EXAM_VIDEO_TOO_LARGE_MESSAGE,
    unsupportedMessage: EXAM_VIDEO_UNSUPPORTED_MESSAGE,
  });
}
