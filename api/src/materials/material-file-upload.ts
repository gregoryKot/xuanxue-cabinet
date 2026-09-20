// Разбор сырого тела загрузки файла материала (ADR-0057). Формат
// определяется по сигнатуре байтов, а не по заголовку `Content-Type`
// (SECURITY §4, общий механизм — common/raw-upload.ts): честному заголовку
// не верим — с ним в бакет уехал бы любой файл под видом PDF, и раздали бы
// мы его под тем же заголовком.
//
// Чистая функция без Mongo и без DI (CLAUDE.md «Логика вне контроллеров»).
import {
  MATERIAL_FILE_EMPTY_MESSAGE,
  MATERIAL_FILE_LIMITS,
  MATERIAL_FILE_TOO_LARGE_MESSAGE,
  MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  type MaterialFileContentType,
} from '@xuanxue/shared';
import {
  isPdfSignature,
  parseRawUpload,
  sniffImageSignature,
} from '../common/raw-upload';

export interface ParsedMaterialFile {
  bytes: Buffer;
  contentType: MaterialFileContentType;
}

/** PDF или картинка — четыре типа из MATERIAL_FILE_CONTENT_TYPES, и все
 * распознаются по первым байтам. */
function sniffMaterialFileType(bytes: Buffer): MaterialFileContentType | null {
  if (isPdfSignature(bytes)) return 'application/pdf';
  return sniffImageSignature(bytes);
}

export function parseMaterialFileUpload(body: unknown): ParsedMaterialFile {
  return parseRawUpload<MaterialFileContentType>(body, {
    maxBytes: MATERIAL_FILE_LIMITS.maxBytes,
    sniff: sniffMaterialFileType,
    emptyMessage: MATERIAL_FILE_EMPTY_MESSAGE,
    tooLargeMessage: MATERIAL_FILE_TOO_LARGE_MESSAGE,
    unsupportedMessage: MATERIAL_FILE_UNSUPPORTED_MESSAGE,
  });
}
